/**
 * Mermaid diagram support for TypeDoc.
 *
 * Adapted from typedoc-plugin-mermaid by kamiazya.
 *
 * @packageDocumentation
 * @see {@link https://github.com/kamiazya/typedoc-plugin-mermaid}
 */
import {
  type Application,
  type PageEvent,
  ParameterType,
  Renderer,
} from 'typedoc';

/**
 * Default CDN URL for loading the Mermaid library.
 */
export const DEFAULT_CDN_URL =
  'https://unpkg.com/mermaid@latest/dist/mermaid.esm.min.mjs';

const MERMAID_BLOCK_START = '<div class="mermaid-block">';
const MERMAID_BLOCK_END = '</div>';

const style = `
<style>
/* Contain mermaid blocks */
.mermaid-block {
  overflow-x: auto;
  max-width: 100%;
}

.mermaid-block > .mermaid {
  max-width: 100%;
}

.mermaid-block svg {
  max-width: 100%;
  height: auto;
}

/* Hide fallback pre when mermaid is enabled */
:root.mermaid-enabled .mermaid-block > pre {
  display: none;
}

/* Hide mermaid divs until JS reveals the correct one (visibility allows rendering) */
.mermaid-block > .mermaid {
  visibility: hidden;
  position: absolute;
}

/* Once JS has applied inline display styles, make visible */
.mermaid-block > .mermaid[style*="display: block"] {
  visibility: visible;
  position: static;
}
</style>
`;

/**
 * Generate the script tag for initializing Mermaid.
 *
 * @param cdnUrl - URL to load the Mermaid library from
 * @returns The script HTML to inject
 */
const getScript = (cdnUrl: string): string => `
<script type="module">
import mermaid from "${cdnUrl}";

document.documentElement.classList.add("mermaid-enabled");

mermaid.initialize({
  startOnLoad: true,
  flowchart: { useMaxWidth: true },
  sequence: { useMaxWidth: true },
});

// Determine if we're in dark mode
function isDarkMode() {
  // TypeDoc uses data-theme attribute on html element
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  // Fall back to system preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Update diagram visibility based on current theme
function updateDiagramVisibility() {
  const dark = isDarkMode();
  document.querySelectorAll(".mermaid-block .mermaid.dark").forEach(el => {
    el.style.display = dark ? "block" : "none";
  });
  document.querySelectorAll(".mermaid-block .mermaid.light").forEach(el => {
    el.style.display = dark ? "none" : "block";
  });
}

// Wait for mermaid to render ALL SVGs before setting initial visibility
requestAnimationFrame(function check() {
  const allMermaids = document.querySelectorAll("div.mermaid");
  const rendered = document.querySelectorAll("div.mermaid svg");

  if (rendered.length < allMermaids.length) {
    // Still waiting for mermaid to render
    requestAnimationFrame(check);
  } else {
    // All diagrams rendered, now apply visibility
    updateDiagramVisibility();
  }
});

// Watch for theme changes via attribute mutation
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === "data-theme") {
      updateDiagramVisibility();
    }
  }
});
observer.observe(document.documentElement, { attributes: true });

// Also watch system preference changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateDiagramVisibility);
</script>
`;

/**
 * Escape HTML entities for display in fallback pre block.
 *
 * @param str - The string to escape
 * @returns The escaped string
 */
export const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Unescape HTML entities back to plain text for mermaid to parse. Angle
 * brackets use mermaid's #entity; syntax to avoid parsing issues.
 *
 * @param str - The string to unescape
 * @returns The unescaped string
 */
export const unescapeHtml = (str: string): string => {
  return str
    .replace(/&lt;/g, '#lt;') // Use mermaid's entity syntax for <
    .replace(/&gt;/g, '#gt;') // Use mermaid's entity syntax for >
    .replace(/&quot;/g, '#quot;')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '#amp;');
};

/**
 * Convert HTML-escaped mermaid code to a block with dark/light variants.
 *
 * @param escapedCode - HTML-escaped mermaid code from the pre/code block
 * @returns The mermaid block HTML
 */
export const toMermaidBlock = (escapedCode: string): string => {
  // Unescape for mermaid to parse, then re-escape for the fallback pre
  const plainCode = unescapeHtml(escapedCode).trim();
  const htmlCode = escapeHtml(plainCode);

  const dark = `<div class="mermaid dark">%%{init:{"theme":"dark"}}%%\n${plainCode}</div>`;
  const light = `<div class="mermaid light">%%{init:{"theme":"default"}}%%\n${plainCode}</div>`;
  const pre = `<pre><code class="language-mermaid">${htmlCode}</code></pre>`;

  return MERMAID_BLOCK_START + dark + light + pre + MERMAID_BLOCK_END;
};

/**
 * Replace pre/code mermaid blocks in HTML with mermaid divs.
 *
 * @param html - The HTML to transform
 * @returns The transformed HTML
 */
export const transformMermaidBlocks = (html: string): string => {
  // Match <pre><code class="mermaid">...</code><button>Copy</button></pre>
  // TypeDoc adds a copy button after the code element
  return html.replace(
    /<pre><code class="mermaid">([\s\S]*?)<\/code><button[^>]*>Copy<\/button><\/pre>/g,
    (_, code: string) => toMermaidBlock(code),
  );
};

/**
 * Check if page has mermaid blocks and inject script/styles.
 *
 * @param html - The HTML to process
 * @param cdnUrl - URL to load the Mermaid library from
 * @returns The processed HTML
 */
export const processMermaidPage = (
  html: string,
  cdnUrl = DEFAULT_CDN_URL,
): string => {
  // First transform any mermaid code blocks
  html = transformMermaidBlocks(html);

  // Only inject scripts if we have mermaid blocks
  if (!html.includes(MERMAID_BLOCK_START)) {
    return html;
  }

  // Insert styles before </head>
  const headEndIndex = html.indexOf('</head>');
  if (headEndIndex !== -1) {
    html = html.slice(0, headEndIndex) + style + html.slice(headEndIndex);
  }

  // Insert script before </body>
  const bodyEndIndex = html.lastIndexOf('</body>');
  if (bodyEndIndex !== -1) {
    html =
      html.slice(0, bodyEndIndex) +
      getScript(cdnUrl) +
      html.slice(bodyEndIndex);
  }

  return html;
};

/**
 * TypeDoc plugin entry point.
 *
 * @param app - The TypeDoc application
 */
export const load = (app: Application): void => {
  // Declare the mermaidCdnUrl option
  app.options.addDeclaration({
    defaultValue: DEFAULT_CDN_URL,
    help: 'URL to load the Mermaid library from',
    name: 'mermaidCdnUrl',
    type: ParameterType.String,
  });

  // Process mermaid blocks in final HTML output
  app.renderer.on(Renderer.EVENT_END_PAGE, (page: PageEvent) => {
    if (page.contents) {
      const cdnUrl = app.options.getValue('mermaidCdnUrl') as string;
      page.contents = processMermaidPage(page.contents, cdnUrl);
    }
  });
};
