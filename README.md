# @boneskull/typedoc-plugin-mermaid

> TypeDoc plugin for rendering Mermaid diagrams

This plugin transforms Mermaid code blocks in your TypeDoc documentation into
rendered diagrams. It automatically adapts to TypeDoc's light and dark themes.

## Features

- Renders Mermaid diagrams from fenced code blocks
- Automatic dark/light theme switching based on TypeDoc theme
- Graceful fallback to plain code when JavaScript is disabled
- Loads Mermaid from CDN (no bundled dependencies)
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

## How It Works

The plugin hooks into TypeDoc's HTML rendering pipeline and:

1. Finds `<pre><code class="mermaid">` blocks in the output
2. Wraps them in a container with both dark and light themed versions
3. Injects CSS and JavaScript to render diagrams and switch themes
4. Preserves the original code as a fallback for non-JS environments

Diagrams are rendered client-side using the Mermaid library loaded from unpkg
CDN.

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
| Mermaid loading       | CDN (unpkg)                                 | Bundled or CDN                  |
| Configuration options | None (zero-config)                          | Theme, version, CDN URL         |

**Why a new plugin?**

The original plugin stopped working with TypeDoc 0.27+ due to breaking API
changes and appears unmaintained.

## License

Copyright © 2026 [Christopher "boneskull" Hiller](https://github.com/boneskull). Licensed
[BlueOak-1.0.0](https://blueoakcouncil.org/license/1.0.0).
