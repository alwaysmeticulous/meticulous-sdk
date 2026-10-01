# @alwaysmeticulous/replay-debugger-ui

## 2.343.0

### Patch Changes

- [#14289](https://github.com/alwaysmeticulous/meticulous/pull/14289) [`f5dcffa`](https://github.com/alwaysmeticulous/meticulous/commit/f5dcffa319879fcc1f12a3e855ead2fa44866ba5) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - The CLI is now distributed as a self-contained bundle, so installing it via
  `npx` no longer resolves a separate runtime dependency tree.

  The CLI package no longer exports its internal yargs command modules
  (`recordCommand`, `replayCommand`, `ciRunLocalCommand` and
  `ciStartTunnelCommand`). `labelCommitCore` remains available for programmatic
  use.

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability
