import { plugin, Transpiler } from "bun"

// Bun loads TSX without Vite's Solid compiler. Use Solid's hyperscript JSX runtime
// only in tests, keeping the real core/store modules and their resolution conditions.
const transpiler = new Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react-jsx", jsxImportSource: "solid-js/h" } },
})

plugin({
  name: "solid-test-jsx",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async ({ path }) => ({
      contents: transpiler.transformSync(await Bun.file(path).text()),
      loader: "js",
    }))
  },
})
