# AGENTS.md

This file provides guidance to AI agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## What This Is

**@boneskull/typedoc-plugin-mermaid** is a TypeDoc plugin that transforms Mermaid code blocks in documentation comments into rendered diagrams.

**Purpose**: Enable developers to embed Mermaid diagrams (flowcharts, sequence diagrams, state machines, ER diagrams, etc.) directly in their TSDoc/JSDoc comments, rendered beautifully in TypeDoc's HTML output.

**Key Features**:

- Transforms ` ```mermaid ` code blocks into rendered SVG diagrams
- Automatic dark/light theme switching based on TypeDoc's theme
- Two loading modes: CDN (default) or local (offline/air-gapped)
- Graceful fallback to plain code when JavaScript is disabled
- Client-side rendering via Mermaid library

## Quick Start

```bash
npm install              # Install dependencies
npm run build            # Build ESM output via zshy
npm test                 # Run tests with node:test
npm run test:watch       # TDD watch mode
npm run lint             # Check all linters
npm run fix              # Auto-fix issues
```

### Testing the Plugin

```bash
# Build the plugin first
npm run build

# Generate example docs (from project root)
cd examples && npx typedoc
# Open examples/docs/index.html to see rendered diagrams
```

## Project Structure

```text
typedoc-plugin-mermaid/
├── src/index.ts         # Complete plugin implementation (single file)
├── test/index.test.ts   # Unit tests for all exported functions
├── dist/                # Build output: index.js (ESM), index.d.ts
├── examples/            # Example project demonstrating the plugin
│   ├── src/index.ts     # Source with Mermaid diagrams in TSDoc
│   ├── typedoc.json     # TypeDoc config using ../dist/index.js
│   └── docs/            # Generated documentation output (gitignored)
├── .github/workflows/   # CI: lint, test (Node 22/24), release-please
└── package.json         # Note: ESM-only (no CJS), peer deps on typedoc/mermaid
```

## How the Plugin Works

The plugin hooks into TypeDoc's rendering pipeline:

1. **`Renderer.EVENT_BEGIN`**: Validates configuration; if `mermaidSource: "local"`, resolves mermaid's dist path early
2. **`Renderer.EVENT_END_PAGE`**: For each HTML page:
   - Finds `<pre><code class="mermaid">` blocks
   - Transforms them into dual dark/light `<div class="mermaid">` blocks
   - Injects CSS for theme switching and fallback handling
   - Injects ES module script to initialize Mermaid
3. **`postRenderAsyncJobs`**: If local mode, copies mermaid ESM files to `assets/mermaid/`

### Key Design Decisions

**Dual diagrams for theming**: Each mermaid block becomes two `<div>`s (dark + light themed), with CSS toggling visibility based on TypeDoc's `data-theme` attribute. This ensures diagrams match the documentation theme.

**ESM-only loading**: Both CDN and local modes use ES module imports (`import mermaid from "..."`). Local mode preserves mermaid's lazy-loaded chunks directory for efficient loading.

**Client-side rendering**: Diagrams render in the browser, not at build time. This keeps the plugin simple and avoids puppeteer/playwright dependencies.

## Plugin Configuration

Two options declared via TypeDoc's `app.options.addDeclaration()`:

| Option          | Type                 | Default   | Description                           |
| --------------- | -------------------- | --------- | ------------------------------------- |
| `mermaidSource` | `"cdn"` \| `"local"` | `"cdn"`   | Where to load Mermaid from            |
| `mermaidCdnUrl` | `string`             | unpkg URL | CDN URL (only when source is `"cdn"`) |

## Key Functions

All implementation is in `src/index.ts`:

| Function                                | Purpose                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `load(app)`                             | TypeDoc plugin entry point; registers options and handlers |
| `processMermaidPage(html, options)`     | Main transformation: finds blocks, injects styles/scripts  |
| `transformMermaidBlocks(html)`          | Regex replacement of `<pre><code class="mermaid">` blocks  |
| `toMermaidBlock(escapedCode)`           | Creates dark/light div structure with fallback             |
| `getScript(options)`                    | Generates the ES module script for mermaid init            |
| `resolveMermaidDistPath()`              | Finds mermaid in node_modules for local mode               |
| `getRelativeAssetPath(pageUrl)`         | Calculates `../` depth for nested pages                    |
| `escapeHtml(str)` / `unescapeHtml(str)` | HTML entity handling for mermaid syntax                    |

## Testing Patterns

Tests use `node:test` + `bupkis`. Each exported function has focused unit tests:

```typescript
import { expect } from 'bupkis';
import { describe, it } from 'node:test';

describe('transformMermaidBlocks', () => {
  it('should transform TypeDoc mermaid code blocks', () => {
    const input =
      '<pre><code class="mermaid">graph TD</code><button>Copy</button></pre>';
    const result = transformMermaidBlocks(input);

    expect(result, 'to contain', '<div class="mermaid-block">');
  });
});
```

**Test files**: `test/**/*.test.ts` pattern
**Run with**: `npm test` or `npm run test:watch`

## Common Pitfalls

1. **TypeDoc version mismatch**: Plugin requires TypeDoc 0.27+ (uses different Renderer API than 0.26 and earlier)
2. **Mermaid not found in local mode**: Must install mermaid as dev dependency: `npm install mermaid -D`
3. **"mermaid" highlight warning**: Add `"ignoredHighlightLanguages": ["mermaid"]` to typedoc.json
4. **Diagrams not rendering**: Check browser console; common issues are CSP blocking CDN or malformed mermaid syntax
5. **Theme not switching**: Ensure TypeDoc theme toggle is working; plugin observes `data-theme` attribute changes
6. **ESM entry point missing**: Requires mermaid >= 11.0.0 for ESM bundle with chunks

## Code Style

- Semicolons required, single quotes, 2-space indentation
- Arrow functions for callbacks
- Inline type imports: `import { type Foo } from 'bar'`
- Unused variables start with `_`
- Docstrings on all exported functions

## Conventional Commits

```bash
feat: add new feature        # Minor version bump
fix: resolve bug             # Patch version bump
chore: update dependencies   # No version bump
docs: update README          # No version bump
```

## Dependencies

**Peer dependencies** (user must install):

- `typedoc` >= 0.27.0
- `mermaid` >= 11.0.0 (optional, required for local mode)

**Dev dependencies** include:

- `typedoc` and `mermaid` for development/testing
- `bupkis` for assertions
- `zshy` for ESM-only builds
- Standard linting stack (eslint, prettier, cspell, etc.)

## TypeDoc Plugin API Reference

Key TypeDoc types used:

```typescript
import {
  type Application,      // Main TypeDoc app, passed to load()
  type PageEvent,        // Event data for page rendering
  ParameterType,         // For option declarations (Map, String, etc.)
  Renderer,              // Renderer.EVENT_* constants
} from 'typedoc';

// Plugin entry point signature
export const load = (app: Application): void => { ... };
```

## Quick Reference

| Task         | Command                      |
| ------------ | ---------------------------- |
| Build        | `npm run build`              |
| Test         | `npm test`                   |
| TDD          | `npm run test:watch`         |
| Lint         | `npm run lint`               |
| Fix          | `npm run fix`                |
| Type check   | `npm run lint:types`         |
| Example docs | `cd examples && npx typedoc` |

## Resources

- **TypeDoc Plugin Development**: https://typedoc.org/guides/development/plugins/
- **Mermaid Documentation**: https://mermaid.js.org/intro/
- **TypeDoc Renderer API**: https://typedoc.org/api/classes/Renderer.html
- **Original plugin (inspiration)**: https://github.com/kamiazya/typedoc-plugin-mermaid
- **bupkis assertions**: https://github.com/boneskull/bupkis
- **Author**: Christopher Hiller (boneskull@boneskull.com)
