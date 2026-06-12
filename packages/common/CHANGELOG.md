# @alwaysmeticulous/common

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
