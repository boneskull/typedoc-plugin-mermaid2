# Plugin Test Example

This directory contains an example project for manually testing the
`@boneskull/typedoc-plugin-mermaid` plugin.

## Usage

From the repository root:

```bash
# Build the plugin first
npm run build

# Generate the example docs (run from examples/ dir)
cd examples && npx typedoc

# Open the generated docs
open examples/docs/index.html
```

Or from this directory:

```bash
npx typedoc
open docs/index.html
```

## What to Test

The example source code includes Mermaid diagrams in:

- Module-level documentation (`@packageDocumentation`)
- Type alias documentation (`OrderStatus`)
- Class documentation (`StateMachine`)
- Method documentation (`start()`)
- Function documentation (`processData`)
- Interface documentation (`DatabaseSchema`)

Diagram types included:

- Flowcharts
- State diagrams
- Sequence diagrams
- Class diagrams
- Entity-relationship diagrams

### Things to Verify

1. Diagrams render correctly in both light and dark themes
2. Theme switching works without page reload
3. Fallback code blocks appear when JS is disabled
4. Multiple diagrams on the same page work
5. Diagrams in different documentation contexts (modules, classes, functions)
   all render
