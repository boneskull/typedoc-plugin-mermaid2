import { expect } from 'bupkis';
import { JSDOM } from 'jsdom';
import { before, describe, it } from 'node:test';

import {
  DEFAULT_CDN_URL,
  getRelativeAssetPath,
  getScript,
  type MermaidScriptOptions,
  processMermaidPage,
  resolveMermaidDistPath,
  toMermaidBlock,
  transformMermaidBlocks,
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

  it('should produce HTML that browsers decode into valid mermaid syntax', async () => {
    const mermaid = await import('mermaid');

    // Each test case is HTML-encoded content as TypeDoc would produce inside
    // a <code> element. The plugin passes this through unchanged into
    // <div class="mermaid"> elements via toMermaidBlock().
    const testCases = [
      'stateDiagram-v2\n  [*] --&gt; Idle\n  Idle --&gt; Running',
      'sequenceDiagram\n  A-&gt;&gt;B: Hello\n  B--&gt;&gt;A: Hi',
      'flowchart LR\n  A --&gt; B --&gt; C',
      'flowchart LR\n  A &lt;--&gt; B\n  B &lt;--&gt; C',
    ];

    for (const encoded of testCases) {
      // Run the plugin's toMermaidBlock on the encoded content
      const blockHtml = toMermaidBlock(encoded);

      // Simulate the browser: parse the plugin's HTML output, then read
      // textContent from a mermaid div to get the decoded text that
      // mermaid's parser would receive at runtime.
      const dom = new JSDOM(`<body>${blockHtml}</body>`);
      const mermaidDiv = dom.window.document.querySelector('.mermaid.light');
      const diagramText = mermaidDiv?.textContent ?? '';

      // Verify mermaid can parse the result
      const result = await mermaid.default.parse(diagramText);
      expect(result, 'to be truthy');
    }
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

    // The code in mermaid divs should be trimmed
    expect(result, 'to contain', '%%\ngraph TD</div>');
  });

  it('should preserve HTML entities in mermaid divs', () => {
    // HTML entities must NOT be unescaped — mermaid's entityDecode handles them
    const result = toMermaidBlock('graph TD\n  A--&gt;B');

    expect(result, 'to contain', 'A--&gt;B</div>');
  });

  it('should preserve HTML entities for angle brackets followed by letters', () => {
    // v0.2.1 edge case: <int> would be parsed as HTML if unescaped
    const result = toMermaidBlock('A[List&lt;int&gt;] --&gt; B');

    expect(result, 'to contain', 'List&lt;int&gt;');
    expect(result, 'not to contain', 'List<int>');
  });

  it('should preserve HTML entities for HTML-like content in labels', () => {
    // <b> would be parsed as a real HTML element if unescaped
    const result = toMermaidBlock(
      'A[&quot;&lt;b&gt;bold&lt;/b&gt;&quot;] --&gt; B',
    );

    expect(result, 'to contain', '&lt;b&gt;bold&lt;/b&gt;');
    expect(result, 'not to contain', '<b>bold</b>');
  });

  it('should preserve &amp; entities in mermaid divs', () => {
    const result = toMermaidBlock('A[AT&amp;T] --&gt; B');

    expect(result, 'to contain', 'AT&amp;T');
  });

  it('should preserve &#39; entities in mermaid divs', () => {
    const result = toMermaidBlock('A[it&#39;s done] --&gt; B');

    expect(result, 'to contain', 'it&#39;s done');
  });

  it('should preserve HTML entities in fallback pre block', () => {
    const result = toMermaidBlock('A[List&lt;int&gt;] --&gt; B');

    expect(
      result,
      'to contain',
      '<code class="language-mermaid">A[List&lt;int&gt;] --&gt; B</code>',
    );
  });

  it('should preserve mermaid #entity; syntax unchanged', () => {
    const result = toMermaidBlock('A[&quot;Value #lt; 10&quot;]');

    expect(result, 'to contain', '#lt;');
  });

  it('should pass through content with no HTML entities unchanged', () => {
    const result = toMermaidBlock('graph TD\n  A --- B');

    expect(result, 'to contain', 'A --- B</div>');
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

  it('should handle multiline mermaid code and preserve entities', () => {
    const input = `<pre><code class="mermaid">graph TD
  A[Start] --&gt; B[End]
  B --&gt; C[Done]</code><button>Copy</button></pre>`;
    const result = transformMermaidBlocks(input);

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'to contain', 'A[Start]');
    // HTML entities must survive the transformation
    expect(result, 'to contain', '--&gt; B[End]');
    expect(result, 'to contain', '--&gt; C[Done]');
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

  it('should preserve HTML entities through the full processing pipeline', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">flowchart LR
  A[List&lt;int&gt;] --&gt; B[AT&amp;T]
  B &lt;--&gt; C</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input, cdnOptions());

    // Entities must survive into the mermaid divs
    expect(result, 'to contain', 'List&lt;int&gt;');
    expect(result, 'to contain', 'AT&amp;T');
    expect(result, 'to contain', '&lt;--&gt;');
    // Raw angle brackets must NOT appear (would be parsed as HTML by browser)
    expect(result, 'not to contain', 'List<int>');
  });
});
