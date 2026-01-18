# @boneskull/typedoc-plugin-mermaid

> TypeDoc plugin for rendering Mermaid diagrams

This plugin transforms Mermaid code blocks in your TypeDoc documentation into
rendered diagrams. It automatically adapts to TypeDoc's light and dark themes.

## Features

- Renders Mermaid diagrams from fenced code blocks
- Automatic dark/light theme switching based on TypeDoc theme
- Graceful fallback to plain code when JavaScript is disabled
- Loads Mermaid from CDN or locally from your `node_modules`
- Responsive diagram sizing

## Install

```shell
npm install @boneskull/typedoc-plugin-mermaid -D
```

## Usage

Add the plugin to your `typedoc.json`:

```json
{
  "ignoredHighlightLanguages": ["mermaid"],
  "plugin": ["@boneskull/typedoc-plugin-mermaid"]
}
```

The `ignoredHighlightLanguages` option silences TypeDoc warnings about `mermaid`
not being a recognized highlight language (this plugin handles it separately).

Or via command line:

```shell
typedoc --plugin @boneskull/typedoc-plugin-mermaid
```

Then use Mermaid code blocks in your documentation comments:

````typescript
/**
 * Represents a workflow state machine.
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> Idle
 *   Idle --> Processing: start()
 *   Processing --> Complete: finish()
 *   Processing --> Error: fail()
 *   Complete --> [*]
 *   Error --> Idle: retry()
 * ```
 */
export class Workflow {
  // ...
}
````

### Supported Diagram Types

Any diagram type supported by Mermaid works:

- Flowcharts
- Sequence diagrams
- Class diagrams
- State diagrams
- Entity Relationship diagrams
- Gantt charts
- Pie charts
- And more...

See the [Mermaid documentation](https://mermaid.js.org/intro/) for all diagram
types and syntax.

## Configuration

### `mermaidSource`

Where to load the Mermaid library from. Defaults to `"cdn"`.

| Value     | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| `"cdn"`   | Load from a CDN URL (configured via `mermaidCdnUrl`)             |
| `"local"` | Copy mermaid's ESM bundle from `node_modules` to the docs output |

**typedoc.json:**

```json
{
  "mermaidSource": "local"
}
```

When using `"local"`, you must install mermaid in your project:

```shell
npm install mermaid -D
```

The plugin copies mermaid's ESM entry point and chunks directory to
`assets/mermaid/` in your docs output. Diagram-specific code is lazy-loaded on
demand, so only the diagram types you actually use are downloaded by browsers.

**Use `"local"` when you need:**

- Offline documentation
- Air-gapped or restricted network environments
- Pinned mermaid versions bundled with your docs
- Full control over the mermaid distribution

### `mermaidCdnUrl`

URL to load the Mermaid library from. Defaults to
`https://unpkg.com/mermaid@latest/dist/mermaid.esm.min.mjs`.

Only used when `mermaidSource` is `"cdn"` (the default).

This is useful for using alternative CDNs or self-hosting the library.

**typedoc.json:**

```json
{
  "mermaidCdnUrl": "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
}
```

**Command line:**

```shell
typedoc --mermaidCdnUrl "https://your-cdn.example.com/mermaid.esm.min.mjs"
```

## How It Works

The plugin hooks into TypeDoc's HTML rendering pipeline and:

1. Finds `<pre><code class="mermaid">` blocks in the output
2. Wraps them in a container with both dark and light themed versions
3. Injects CSS and JavaScript to render diagrams and switch themes
4. Preserves the original code as a fallback for non-JS environments

Diagrams are rendered client-side using the Mermaid library, loaded either from
a CDN or from a local copy in your docs output (depending on `mermaidSource`).

## Acknowledgments

This plugin is adapted from
[typedoc-plugin-mermaid](https://github.com/kamiazya/typedoc-plugin-mermaid) by
[kamiazya](https://github.com/kamiazya).

### Differences from the Original

| Feature               | This Plugin                                 | kamiazya/typedoc-plugin-mermaid |
| --------------------- | ------------------------------------------- | ------------------------------- |
| TypeDoc version       | 0.27+                                       | 0.22–0.26                       |
| Rendering strategy    | Dual dark/light diagrams with CSS switching | Single diagram per block        |
| Theme support         | Automatic dark/light based on TypeDoc theme | Manual theme configuration      |
| `@mermaid` JSDoc tag  | Not supported                               | Supported                       |
| Mermaid loading       | CDN or local ESM bundle with lazy chunks    | Bundled UMD or CDN              |
| Offline support       | Yes (with `mermaidSource: "local"`)         | Yes (when bundled)              |
| Configuration options | `mermaidSource`, `mermaidCdnUrl`            | `mermaidVersion`, `mermaidCdn`  |

**Why a new plugin?**

The original plugin stopped working with TypeDoc 0.27+ due to breaking API
changes and appears unmaintained.

## License

Copyright © 2026 [Christopher "boneskull" Hiller](https://github.com/boneskull). Licensed
[BlueOak-1.0.0](https://blueoakcouncil.org/license/1.0.0).
