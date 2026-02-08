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

/* Hide mermaid divs until rendered by JS */
.mermaid-block > .mermaid {
  visibility: hidden;
  position: absolute;
}

/* Show diagrams once rendered */
.mermaid-block > .mermaid.rendered {
  visibility: visible;
  position: static;
}
</style>
`;

/**
 * The shared mermaid initialization and theme-switching logic.
 *
 * This is the common JavaScript code used by both CDN and local modes.
 *
 * Uses `startOnLoad: false` and `mermaid.run()` so that only one SVG per
 * diagram exists in the DOM at a time. On theme change, each diagram is
 * re-rendered with the appropriate mermaid theme via `mermaid.run()`. This
 * avoids duplicate SVG marker IDs that break arrowheads in sequence, C4,
 * journey, timeline, and state-v1 diagrams.
 *
 * Diagram source is stored in `data-mermaid-code` attributes. Before each
 * render cycle, the script populates each element's `textContent` with the
 * source prefixed by a `%%{init:{"theme":"..."}}%%` directive, clears
 * `data-processed`, and calls `mermaid.run()`.
 */
const mermaidInitScript = `
document.documentElement.classList.add("mermaid-enabled");

mermaid.initialize({
  startOnLoad: false,
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

// Render all diagrams with the current theme using mermaid.run()
async function renderAllDiagrams() {
  const theme = isDarkMode() ? "dark" : "default";
  const directive = '%%{init:{"theme":"' + theme + '"}}%%\\n';
  document.querySelectorAll("[data-mermaid-code]").forEach((el) => {
    el.classList.remove("rendered");
    el.removeAttribute("data-processed");
    el.textContent = directive + el.dataset.mermaidCode;
  });
  await mermaid.run({ querySelector: "[data-mermaid-code]", suppressErrors: true });
  document.querySelectorAll("[data-mermaid-code]").forEach((el) => {
    el.classList.add("rendered");
  });
}

renderAllDiagrams();

// Watch for theme changes via attribute mutation
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === "data-theme") {
      renderAllDiagrams();
    }
  }
});
observer.observe(document.documentElement, { attributes: true });

// Also watch system preference changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAllDiagrams);
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
 * Convert HTML-escaped mermaid code to a renderable block.
 *
 * Emits an empty `<div class="mermaid">` with the diagram source stored in a
 * `data-mermaid-code` attribute. The client-side script reads this attribute,
 * sets the element's `textContent` with a theme directive prefix, and calls
 * `mermaid.run()`. On theme change, the process repeats with the new theme.
 *
 * The HTML-encoded content from TypeDoc (e.g., `&lt;` for `<`) is stored
 * directly in the attribute. The browser decodes entities when reading
 * `el.dataset.mermaidCode`, and setting `el.textContent` re-encodes them for
 * `mermaid.run()` to decode via its `entityDecode()` step.
 *
 * @param escapedCode - HTML-escaped mermaid code from the pre/code block
 * @returns The mermaid block HTML
 */
export const toMermaidBlock = (escapedCode: string): string => {
  // Escape any unencoded double quotes for safe interpolation into the attribute
  const code = escapedCode.trim().replaceAll('"', '&quot;');

  const div = `<div class="mermaid" data-mermaid-code="${code}"></div>`;
  const pre = `<pre><code class="language-mermaid">${code}</code></pre>`;

  return MERMAID_BLOCK_START + div + pre + MERMAID_BLOCK_END;
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
