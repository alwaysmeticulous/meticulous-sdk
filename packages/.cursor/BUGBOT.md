## Releases

### Changes to public packages should include a changeset

Packages under `public_packages/` are versioned and published publicly (e.g. to npm) via [changesets](https://github.com/changesets/changesets). If a PR modifies files under `public_packages/` in a way that should be released, it should also include a changeset entry (an added `.changeset/*.md` file). If no changeset is present, remind the author to add one by running `pnpm changeset`. Tests-only or internal tooling changes that don't need a release can be exempt.

## Security

### Nothing sensitive in public packages

Everything under `public_packages/` is published publicly (e.g. to npm). Flag any change that introduces sensitive or non-public information into this folder, including in code, comments, fixtures, test data, or docs. Examples: customer/company names, employee names, internal URLs or hostnames, API keys, tokens or other secrets, and internal-only product details. Treat all content in this folder as world-readable.
