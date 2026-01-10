import { expect } from 'bupkis';
import { describe, it } from 'node:test';

import {
  escapeHtml,
  processMermaidPage,
  toMermaidBlock,
  transformMermaidBlocks,
  unescapeHtml,
} from '../src/index.js';

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
  it('should convert &lt; to mermaid entity #lt;', () => {
    expect(unescapeHtml('&lt;'), 'to equal', '#lt;');
  });

  it('should convert &gt; to mermaid entity #gt;', () => {
    expect(unescapeHtml('&gt;'), 'to equal', '#gt;');
  });

  it('should convert &quot; to mermaid entity #quot;', () => {
    expect(unescapeHtml('&quot;'), 'to equal', '#quot;');
  });

  it('should convert &#39; back to apostrophe', () => {
    expect(unescapeHtml('&#39;'), 'to equal', "'");
  });

  it('should convert &amp; to mermaid entity #amp;', () => {
    expect(unescapeHtml('&amp;'), 'to equal', '#amp;');
  });

  it('should handle strings with multiple entities', () => {
    expect(
      unescapeHtml('&lt;a href=&quot;foo&quot;&gt;'),
      'to equal',
      '#lt;a href=#quot;foo#quot;#gt;',
    );
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

describe('processMermaidPage', () => {
  it('should inject styles and scripts when mermaid blocks exist', () => {
    const input = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body>
</html>`;
    const result = processMermaidPage(input);

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
    const result = processMermaidPage(input);

    expect(result, 'not to contain', '<style>');
    expect(result, 'not to contain', 'mermaid.initialize');
  });

  it('should insert styles before </head>', () => {
    const input = `<html><head><title>Test</title></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input);

    const styleIndex = result.indexOf('<style>');
    const headEndIndex = result.indexOf('</head>');

    expect(styleIndex, 'to be less than', headEndIndex);
  });

  it('should insert script before </body>', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input);

    const scriptIndex = result.indexOf('<script type="module">');
    const bodyEndIndex = result.indexOf('</body>');

    expect(scriptIndex, 'to be less than', bodyEndIndex);
    expect(scriptIndex, 'to be greater than', 0);
  });

  it('should transform mermaid blocks as part of processing', () => {
    const input = `<html><head></head><body>
<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>
</body></html>`;
    const result = processMermaidPage(input);

    expect(result, 'to contain', '<div class="mermaid-block">');
    expect(result, 'to contain', '<div class="mermaid dark">');
    expect(result, 'to contain', '<div class="mermaid light">');
  });
});
