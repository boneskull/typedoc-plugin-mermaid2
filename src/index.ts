/**
 * Mermaid diagram support for TypeDoc.
 *
 * Adapted from typedoc-plugin-mermaid by kamiazya.
 *
 * @packageDocumentation
 * @see {@link https://github.com/kamiazya/typedoc-plugin-mermaid}
 */
import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  type Application,
  type PageEvent,
  ParameterType,
  Renderer,
} from 'typedoc';

/**
 * Mermaid source options for loading the library.
 */
export type MermaidSource = 'cdn' | 'local';

/**
 * Name of the mermaid ESM entry point file.
 */
const MERMAID_ESM_ENTRY = 'mermaid.esm.min.mjs';

/**
 * Name of the mermaid chunks directory (for lazy-loaded diagram types).
 */
const MERMAID_CHUNKS_DIR = 'chunks/mermaid.esm.min';

/**
 * Default CDN URL for loading the Mermaid library.
 */
export const DEFAULT_CDN_URL =
  'https://unpkg.com/mermaid@latest/dist/mermaid.esm.min.mjs';

/**
 * Result of attempting to resolve mermaid's dist path.
 */
export type MermaidResolutionResult =
  | { distPath: string; ok: true }
  | { error: string; ok: false };

/**
 * Attempt to resolve the path to the mermaid dist directory.
 *
 * Uses `import.meta.url` so Node's module resolution walks up from this
 * plugin's location to find mermaid as a peer dependency.
 *
 * @returns A result object with either the dist path or an error message
 */
export const resolveMermaidDistPath = (): MermaidResolutionResult => {
  const require = createRequire(import.meta.url);

  let mermaidPkg: string;
  try {
    mermaidPkg = require.resolve('mermaid/package.json');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      return {
        error:
          'mermaid package not found. Install it with: npm install mermaid -D',
        ok: false,
      };
    }
    return {
      error: `Failed to resolve mermaid package: ${err}`,
      ok: false,
    };
  }

  const distPath = join(dirname(mermaidPkg), 'dist');
  const esmEntry = join(distPath, MERMAID_ESM_ENTRY);

  // Verify the ESM entry point exists (sanity check)
  try {
    require.resolve(esmEntry);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      return {
        error:
          `mermaid package found but ESM entry point missing at ${esmEntry}. ` +
          'Ensure you have mermaid >= 11.0.0 installed.',
        ok: false,
      };
    }
    return {
      error: `Failed to verify mermaid ESM entry point at ${esmEntry}: ${err}`,
      ok: false,
    };
  }

  return { distPath, ok: true };
};

/**
 * Calculate the relative path from a page URL to the mermaid ESM entry point.
 *
 * @param pageUrl - The URL of the current page (e.g., "classes/Foo.html" or
 *   "index.html")
 * @returns The relative path to the mermaid ESM entry (e.g.,
 *   "./assets/mermaid/mermaid.esm.min.mjs")
 */
export const getRelativeAssetPath = (pageUrl: string): string => {
  const depth = pageUrl.split('/').length - 1;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  return prefix + 'assets/mermaid/' + MERMAID_ESM_ENTRY;
};

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
 * The shared mermaid initialization and theme-switching logic.
 *
 * This is the common JavaScript code used by both CDN and local modes.
 */
const mermaidInitScript = `
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
`;

/**
 * Options for generating the mermaid script tag.
 */
export interface MermaidScriptOptions {
  /**
   * The CDN URL to load mermaid from (used when source is 'cdn').
   */
  cdnUrl: string;

  /**
   * The relative path to the local mermaid asset (used when source is 'local').
   */
  localPath: string;

  /**
   * The source mode for loading mermaid.
   */
  source: MermaidSource;
}

/**
 * Generate the script tag for initializing Mermaid.
 *
 * Both CDN and local modes use ES module imports - the only difference is the
 * URL used for the import.
 *
 * @param options - Configuration for script generation
 * @returns The script HTML to inject
 */
export const getScript = (options: MermaidScriptOptions): string => {
  const mermaidUrl =
    options.source === 'local' ? options.localPath : options.cdnUrl;

  return `
<script type="module">
import mermaid from "${mermaidUrl}";
${mermaidInitScript}
</script>
`;
};

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
 * @param options - Configuration for mermaid script generation
 * @returns The processed HTML
 */
export const processMermaidPage = (
  html: string,
  options: MermaidScriptOptions,
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
      getScript(options) +
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
  // Declare the mermaidSource option
  app.options.addDeclaration({
    defaultValue: 'cdn',
    help: 'Where to load Mermaid from: cdn uses mermaidCdnUrl, local copies from node_modules',
    map: new Map([
      ['cdn', 'cdn'],
      ['local', 'local'],
    ]),
    name: 'mermaidSource',
    type: ParameterType.Map,
  });

  // Declare the mermaidCdnUrl option
  app.options.addDeclaration({
    defaultValue: DEFAULT_CDN_URL,
    help: 'URL to load the Mermaid library from (only used when mermaidSource is "cdn")',
    name: 'mermaidCdnUrl',
    type: ParameterType.String,
  });

  // Track whether we need to copy mermaid (set during page processing)
  let needsMermaidCopy = false;

  // Cache the mermaid resolution result to avoid repeated lookups
  let mermaidResolution: MermaidResolutionResult | undefined;

  // Validate mermaid availability early when rendering starts
  app.renderer.on(Renderer.EVENT_BEGIN, () => {
    // Reset state for each render cycle (important if render is called multiple times)
    needsMermaidCopy = false;
    mermaidResolution = undefined;

    const source = app.options.getValue('mermaidSource') as MermaidSource;

    if (source === 'local') {
      mermaidResolution = resolveMermaidDistPath();
      if (!mermaidResolution.ok) {
        // Throw error to fail the build - continuing would produce broken docs
        throw new Error(`[typedoc-plugin-mermaid] ${mermaidResolution.error}`);
      }
    }
  });

  // Process mermaid blocks in final HTML output
  app.renderer.on(Renderer.EVENT_END_PAGE, (page: PageEvent) => {
    if (page.contents) {
      const source = app.options.getValue('mermaidSource') as MermaidSource;
      const cdnUrl = app.options.getValue('mermaidCdnUrl') as string;
      const localPath = getRelativeAssetPath(page.url);

      const options: MermaidScriptOptions = {
        cdnUrl,
        localPath,
        source,
      };

      const originalContents = page.contents;
      page.contents = processMermaidPage(page.contents, options);

      // If page was modified and we're in local mode, we need to copy mermaid
      if (source === 'local' && page.contents !== originalContents) {
        needsMermaidCopy = true;
      }
    }
  });

  // Copy mermaid ESM files to output when using local mode
  app.renderer.postRenderAsyncJobs.push(async (event) => {
    const source = app.options.getValue('mermaidSource') as MermaidSource;

    if (source !== 'local' || !needsMermaidCopy) {
      return;
    }

    // Use cached resolution or resolve now
    const resolution = mermaidResolution ?? resolveMermaidDistPath();

    if (!resolution.ok) {
      // Error was already logged at render start, but log again if we somehow
      // got here without early validation
      app.logger.error(`[typedoc-plugin-mermaid] ${resolution.error}`);
      return;
    }

    const { distPath } = resolution;
    const destDir = join(event.outputDirectory, 'assets', 'mermaid');

    try {
      await mkdir(destDir, { recursive: true });

      // Copy the ESM entry point
      await cp(
        join(distPath, MERMAID_ESM_ENTRY),
        join(destDir, MERMAID_ESM_ENTRY),
      );

      // Copy the chunks directory (lazy-loaded diagram types)
      await cp(
        join(distPath, MERMAID_CHUNKS_DIR),
        join(destDir, MERMAID_CHUNKS_DIR),
        { recursive: true },
      );

      app.logger.info(
        `[typedoc-plugin-mermaid] Copied mermaid ESM files to ${destDir}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.logger.error(
        `[typedoc-plugin-mermaid] Failed to copy mermaid files: ${message}`,
      );
    }
  });
};
