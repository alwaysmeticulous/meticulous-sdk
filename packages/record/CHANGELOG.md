# @alwaysmeticulous/record

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/common@2.287.1

## 2.290.0

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/common@2.287.1

## 2.289.1

### Patch Changes

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1
  - @alwaysmeticulous/common@2.287.1

## 2.288.2

### Patch Changes

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2
  - @alwaysmeticulous/common@2.287.1

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0
  - @alwaysmeticulous/common@2.287.1

## 2.287.2

### Patch Changes

- [#1175](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1175) [`3020c53`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/3020c53115e1bc39d89dab43f7f440d0b782a047) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Set `window.__meticulous.snippetScriptSrc` during CLI recorder bootstrap so the recorder can auto-install into same-origin iframes. When the recorder is injected via Puppeteer's `evaluateOnNewDocument` there is no `<script>` tag to derive the snippet URL from, so iframe auto-install previously never ran. This fixes `record session` / `record login` (and other `bootstrapRecordingPage` consumers such as the crawler) not recording same-origin iframe content.

## 2.287.1

### Patch Changes

- Updated dependencies [[`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7)]:
  - @alwaysmeticulous/common@2.287.1

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0
  - @alwaysmeticulous/common@2.283.1

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2
  - @alwaysmeticulous/common@2.283.1

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1
  - @alwaysmeticulous/common@2.283.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0
  - @alwaysmeticulous/common@2.283.1

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/api@2.283.1
