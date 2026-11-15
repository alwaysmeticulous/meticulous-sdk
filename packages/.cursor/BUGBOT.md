## Releases

### Changes to public packages should include a changeset

Packages under `public_packages/` are versioned and published publicly (e.g. to npm) via [changesets](https://github.com/changesets/changesets). If a PR modifies files under `public_packages/` in a way that should be released, it should also include a changeset entry (an added `.changeset/*.md` file). If no changeset is present, remind the author to add one by running `pnpm changeset`. Tests-only or internal tooling changes that don't need a release can be exempt.

Also check semver level and backward compatibility across the `BE × NPM` boundary (`docs/deployment-compatibility.md` note 8):

- If the PR changes both `webapp-backend` and `public_packages/` to handle a new response state (for example `testRun: null` with a new skip flag, or a new status enum member), verify what **already-published** `@alwaysmeticulous/cli` / `client` / `remote-replay-launcher` versions do when they receive that new backend response. Updating `public_packages/` in the same PR does not protect customers running pinned CLIs in CI.
- Flag a `patch` changeset when a public function's return type, exit behaviour, or error/skip contract changes in a minor/breaking way for library or CLI callers.

## Security

### Nothing sensitive in public packages

Everything under `public_packages/` is published publicly (e.g. to npm). Flag any change that introduces sensitive or non-public information into this folder, including in code, comments, fixtures, test data, or docs. Examples: customer/company names, employee names, internal URLs or hostnames, API keys, tokens or other secrets, and internal-only product details. Treat all content in this folder as world-readable.
