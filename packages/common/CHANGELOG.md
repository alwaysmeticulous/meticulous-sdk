# @alwaysmeticulous/common

## 2.300.0

### Minor Changes

- [#10377](https://github.com/alwaysmeticulous/meticulous/pull/10377) [`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740) Thanks [@phreppo](https://github.com/phreppo)! - Add `sessionDescription` to custom-check snapshots. Each `Snapshot` now carries the session's short, human-readable description (what the user was doing in the session), or `null` when the session has no description. It is populated at replay time from data already in memory, so custom checks can label sessions in their reports without an extra lookup.

## 2.299.0

### Patch Changes

- [#10371](https://github.com/alwaysmeticulous/meticulous/pull/10371) [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Improvements to replay downloading

## 2.298.0

### Patch Changes

- [#1237](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1237) [`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d) Thanks [@Genora51](https://github.com/Genora51)! - Retry backoff

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

## 2.290.3

### Patch Changes

- [#1199](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1199) [`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557) Thanks [@Genora51](https://github.com/Genora51)! - Remove Bitbucket Pipelines `BITBUCKET_COMMIT` auto-detection for commit SHA resolution. Commit SHA is now always inferred via `git rev-parse HEAD` when not explicitly provided.

  For Bitbucket Pipelines pull-request builds, checkout the PR source tip at the start of your pipeline step (before building): `git reset --hard "$BITBUCKET_COMMIT"`. Bitbucket merges the destination branch into the source branch during Build Setup; Meticulous does not support testing that ephemeral merge commit.

## 2.287.1

### Patch Changes

- [#1176](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1176) [`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7) Thanks [@Genora51](https://github.com/Genora51)! - Auto-detect BitBucket SHAs

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability
