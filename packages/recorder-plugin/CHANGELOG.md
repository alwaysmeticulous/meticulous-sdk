# @alwaysmeticulous/recorder-plugin

## 2.337.1

### Patch Changes

- [#13391](https://github.com/alwaysmeticulous/meticulous/pull/13391) [`118cfca`](https://github.com/alwaysmeticulous/meticulous/commit/118cfca6bd36712bb99a7208fbe7742ff03e4a86) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Keep Tailwind's CSS source map through the Vite build so `@import`ed stylesheets get line-level coverage instead of collapsing onto the entry file.

- [#13383](https://github.com/alwaysmeticulous/meticulous/pull/13383) [`77bf677`](https://github.com/alwaysmeticulous/meticulous/commit/77bf6773c958845b5c9a757dcd4bc4900df54695) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Locate stylesheets that contain Vite asset placeholders with a string search instead of compiling the captured CSS into a regular expression, so large Tailwind stylesheets no longer crash the build.

## 2.337.0

### Minor Changes

- [#13210](https://github.com/alwaysmeticulous/meticulous/pull/13210) [`47f9ccf`](https://github.com/alwaysmeticulous/meticulous/commit/47f9ccf74c9bb847b460e5c62085123932fc7e8f) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add a `@alwaysmeticulous/recorder-plugin/css-sourcemap` Vite plugin that emits CSS source maps, so stylesheet coverage can be attributed back to the stylesheets in the repository.

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

## 2.290.4

### Patch Changes

- [#1203](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1203) [`849aae8`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/849aae82b884469f5c6b333e00d61ee8fbf4945c) Thanks [@Genora51](https://github.com/Genora51)! - Fix silent HTML injection failure when using the rspack plugin with Rsbuild, and add a dedicated `@alwaysmeticulous/recorder-plugin/rsbuild` entry.

## 2.285.0

### Patch Changes

- [#1156](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1156) [`dbd515b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/dbd515b89062a2169aeeba59cfd55b3a9f8395b2) Thanks [@dependabot](https://github.com/apps/dependabot)! - Bump the npm_and_yarn group across 1 directory with 2 updates

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability
