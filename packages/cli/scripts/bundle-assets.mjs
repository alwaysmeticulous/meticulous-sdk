// Non-JS assets of bundled workspace packages that the CLI needs at runtime.
// bundle.mjs copies each `source` to `dist/<name>`; verify-bundle.mjs checks
// for `marker` inside it. The names must match src/bundled-assets.ts.
export const BUNDLED_ASSETS = [
  {
    name: "debug-workspace-templates",
    source: "../debug-workspace/src/templates",
    marker: "CLAUDE.md",
  },
  {
    name: "replay-debugger-ui-out",
    source: "../replay-debugger-ui/out",
    marker: "index.html",
  },
];
