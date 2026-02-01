import { expect } from 'bupkis';
import { JSDOM } from 'jsdom';
import { before, describe, it } from 'node:test';

import {
  DEFAULT_CDN_URL,
  escapeHtml,
  getRelativeAssetPath,
  getScript,
  type MermaidScriptOptions,
  processMermaidPage,
  resolveMermaidDistPath,
  toMermaidBlock,
  transformMermaidBlocks,
  unescapeHtml,
} from '../src/index.js';

/**
 * Helper to create default CDN options for tests.
 */
const cdnOptions = (cdnUrl = DEFAULT_CDN_URL): MermaidScriptOptions => ({
  cdnUrl,
  localPath: './assets/mermaid/mermaid.esm.min.mjs',
  source: 'cdn',
});

/**
 * Helper to create local options for tests.
 */
const localOptions = (
  localPath = './assets/mermaid/mermaid.esm.min.mjs',
): MermaidScriptOptions => ({
  cdnUrl: DEFAULT_CDN_URL,
  localPath,
  source: 'local',
});

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar'), 'to equal', 'foo &amp; bar');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<div>'), 'to equal', '&lt;div&gt;');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('"hello"'), 'to equal', '&quot;hello&quot;');
  });

  it('should escape apostrophes', () => {
    expect(escapeHtml("it's"), 'to equal', 'it&#39;s');
  });

  it('should handle strings with multiple entities', () => {
    expect(
      escapeHtml('<a href="foo">bar & baz</a>'),
      'to equal',
      '&lt;a href=&quot;foo&quot;&gt;bar &amp; baz&lt;/a&gt;',
    );
  });
});

describe('unescapeHtml', () => {
  it('should convert &lt; to <', () => {
    expect(unescapeHtml('&lt;'), 'to equal', '<');
  });

  it('should convert &gt; to >', () => {
    expect(unescapeHtml('&gt;'), 'to equal', '>');
  });

  it('should convert &quot; to "', () => {
    expect(unescapeHtml('&quot;'), 'to equal', '"');
  });

  it('should convert &#39; to apostrophe', () => {
    expect(unescapeHtml('&#39;'), 'to equal', "'");
  });

  it('should convert &amp; to &', () => {
    expect(unescapeHtml('&amp;'), 'to equal', '&');
  });

  it('should handle strings with multiple entities', () => {
    expect(
      unescapeHtml('&lt;a href=&quot;foo&quot;&gt;'),
      'to equal',
      '<a href="foo">',
    );
  });
});

describe('mermaid syntax validation', () => {
  // Set up jsdom globals so mermaid can run in Node.js
  before(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    // @ts-expect-error - assigning to global for mermaid compatibility
    global.window = dom.window;
    global.document = dom.window.document;
    global.DOMParser = dom.window.DOMParser;
  });

  it('should produce valid mermaid syntax after unescaping TypeDoc output', async () => {
    const mermaid = await import('mermaid');

    // Various diagram types with arrows that TypeDoc would escape
    const testCases = [
      'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running',
      'sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi',
      'flowchart LR\n  A --> B --> C',
      'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[End]',
    ];

    for (const rawCode of testCases) {
      // Simulate TypeDoc's HTML escaping
      const escaped = escapeHtml(rawCode);

      // Our unescape should restore valid mermaid syntax
      const unescaped = unescapeHtml(escaped);

      // mermaid.parse() throws on invalid syntax
      const result = await mermaid.default.parse(unescaped);
      expect(result, 'to be truthy');
    }
  });

  it('should fail to parse if arrows are not properly unescaped', async () => {
    const mermaid = await import('mermaid');

    // This simulates the OLD broken behavior where > became #gt;
    const brokenCode = 'stateDiagram-v2\n  [*] --#gt; Idle';

    let parseError: Error | undefined;
    try {
      await mermaid.default.parse(brokenCode);
    } catch (err) {
      parseError = err as Error;
    }

    expect(parseError, 'to be defined');
  });
});

describe('toMermaidBlock', () => {
  it('should create a block with dark and light variants', () => {
    const result = toMermaidBlock('graph TD\n  A--&gt;B');

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'to contain', '<div class="mermaid dark">');
    expect(result, 'to contain', '<div class="mermaid light">');
    expect(result, 'to contain', '%%{init:{"theme":"dark"}}%%');
    expect(result, 'to contain', '%%{init:{"theme":"default"}}%%');
  });

  it('should include fallback pre/code block', () => {
    const result = toMermaidBlock('graph TD\n  A--&gt;B');

    expect(result, 'to contain', '<pre><code class="language-mermaid">');
    expect(result, 'to contain', '</code></pre>');
  });

  it('should trim whitespace from input', () => {
    const result = toMermaidBlock('  graph TD  ');

    // The plain code in mermaid divs should be trimmed
    expect(result, 'to contain', '%%\ngraph TD</div>');
  });
});

describe('transformMermaidBlocks', () => {
  it('should transform TypeDoc mermaid code blocks', () => {
    const input =
      '<pre><code class="mermaid">graph TD</code><button type="button">Copy</button></pre>';
    const result = transformMermaidBlocks(input);

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'not to contain', '<button type="button">Copy</button>');
  });

  it('should not transform non-mermaid code blocks', () => {
    const input =
      '<pre><code class="javascript">const x = 1;</code><button>Copy</button></pre>';
    const result = transformMermaidBlocks(input);

    expect(result, 'to equal', input);
  });

  it('should transform multiple mermaid blocks', () => {
    const input = `
      <pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
      <p>Some text</p>
      <pre><code class="mermaid">sequenceDiagram</code><button>Copy</button></pre>
    `;
    const result = transformMermaidBlocks(input);

    const blockCount = (result.match(/<div class="mermaid-block">/g) || [])
      .length;
    expect(blockCount, 'to equal', 2);
  });

  it('should handle multiline mermaid code', () => {
    const input = `<pre><code class="mermaid">graph TD
  A[Start] --&gt; B[End]
  B --&gt; C[Done]</code><button>Copy</button></pre>`;
    const result = transformMermaidBlocks(input);

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'to contain', 'A[Start]');
  });
});

describe('getRelativeAssetPath', () => {
  it('should return ./ prefix for root-level pages', () => {
    expect(
      getRelativeAssetPath('index.html'),
      'to equal',
      './assets/mermaid/mermaid.esm.min.mjs',
    );
  });

  it('should return ../ prefix for one-level deep pages', () => {
    expect(
      getRelativeAssetPath('classes/Foo.html'),
      'to equal',
      '../assets/mermaid/mermaid.esm.min.mjs',
    );
  });

  it('should return multiple ../ for deeply nested pages', () => {
    expect(
      getRelativeAssetPath('modules/foo/bar/Baz.html'),
      'to equal',
      '../../../assets/mermaid/mermaid.esm.min.mjs',
    );
  });
});

describe('getScript', () => {
  it('should generate ESM module script for CDN mode', () => {
    const result = getScript(cdnOptions());

    expect(result, 'to contain', '<script type="module">');
    expect(result, 'to contain', `import mermaid from "${DEFAULT_CDN_URL}"`);
    expect(result, 'to contain', 'mermaid.initialize');
  });

  it('should generate ESM module script for local mode', () => {
    const localPath = './assets/mermaid/mermaid.esm.min.mjs';
    const result = getScript(localOptions(localPath));

    expect(result, 'to contain', '<script type="module">');
    expect(result, 'to contain', `import mermaid from "${localPath}"`);
    expect(result, 'to contain', 'mermaid.initialize');
  });

  it('should use custom CDN URL in CDN mode', () => {
    const customUrl = 'https://example.com/mermaid.esm.min.mjs';
    const result = getScript(cdnOptions(customUrl));

    expect(result, 'to contain', `import mermaid from "${customUrl}"`);
  });

  it('should use relative path in local mode', () => {
    const localPath = '../assets/mermaid/mermaid.esm.min.mjs';
    const result = getScript(localOptions(localPath));

    expect(result, 'to contain', `import mermaid from "${localPath}"`);
  });
});

describe('resolveMermaidDistPath', () => {
  it('should return ok result with dist path when mermaid is installed', () => {
    // mermaid is installed as a dev dependency for testing
    const result = resolveMermaidDistPath();

    expect(result.ok, 'to be true');
    if (result.ok) {
      expect(result.distPath, 'to end with', 'dist');
      expect(result.distPath, 'to contain', 'node_modules');
      expect(result.distPath, 'to contain', 'mermaid');
    }
  });
});

describe('processMermaidPage', () => {
  it('should inject styles and scripts when mermaid blocks exist', () => {
    const input = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body>
</html>`;
    const result = processMermaidPage(input, cdnOptions());

    expect(result, 'to contain', '<style>');
    expect(result, 'to contain', '.mermaid-block');
    expect(result, 'to contain', '<script type="module">');
    expect(result, 'to contain', 'mermaid.initialize');
  });

  it('should not inject anything when no mermaid blocks exist', () => {
    const input = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<pre><code class="javascript">const x = 1;</code><button>Copy</button></pre>
</body>
</html>`;
    const result = processMermaidPage(input, cdnOptions());

    expect(result, 'not to contain', '<style>');
    expect(result, 'not to contain', 'mermaid.initialize');
  });

  it('should insert styles before </head>', () => {
    const input = `<html><head><title>Test</title></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions());

    const styleIndex = result.indexOf('<style>');
    const headEndIndex = result.indexOf('</head>');

    expect(styleIndex, 'to be less than', headEndIndex);
  });

  it('should insert script before </body>', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions());

    const scriptIndex = result.indexOf('<script type="module">');
    const bodyEndIndex = result.indexOf('</body>');

    expect(scriptIndex, 'to be less than', bodyEndIndex);
    expect(scriptIndex, 'to be greater than', 0);
  });

  it('should transform mermaid blocks as part of processing', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions());

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'to contain', '<div class="mermaid dark">');
    expect(result, 'to contain', '<div class="mermaid light">');
  });

  it('should use the default CDN URL in CDN mode', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions());

    expect(result, 'to contain', `import mermaid from "${DEFAULT_CDN_URL}"`);
  });

  it('should use a custom CDN URL when specified', () => {
    const customUrl =
      'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions(customUrl));

    expect(result, 'to contain', `import mermaid from "${customUrl}"`);
    expect(result, 'not to contain', DEFAULT_CDN_URL);
  });

  it('should handle a self-hosted Mermaid URL', () => {
    const selfHostedUrl = '/assets/vendor/mermaid.esm.min.mjs';
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions(selfHostedUrl));

    expect(result, 'to contain', `import mermaid from "${selfHostedUrl}"`);
  });

  it('should use ESM import for local mode', () => {
    const localPath = './assets/mermaid/mermaid.esm.min.mjs';
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, localOptions(localPath));

    expect(result, 'to contain', '<script type="module">');
    expect(result, 'to contain', `import mermaid from "${localPath}"`);
  });

  it('should use relative path for nested pages in local mode', () => {
    const localPath = '../../assets/mermaid/mermaid.esm.min.mjs';
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, localOptions(localPath));

    expect(result, 'to contain', `import mermaid from "${localPath}"`);
  });
});
