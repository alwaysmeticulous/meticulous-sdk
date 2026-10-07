# @alwaysmeticulous/browser-installer

## 2.347.0

### Minor Changes

- [#14884](https://github.com/alwaysmeticulous/meticulous/pull/14884) [`0e6c244`](https://github.com/alwaysmeticulous/meticulous/commit/0e6c244478e7947d38f312b15c63693352db4a7a) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Upgrade to puppeteer-core 25.10.0 and `@puppeteer/browsers` 3.2.2 (Chrome for
  Testing 152), which drops the unmaintained `extract-zip` dependency.

  **Breaking:** `ensureBrowser()` moved from `@alwaysmeticulous/common` to the new
  `@alwaysmeticulous/browser-installer` package, along with the puppeteer
  dependencies, so `@alwaysmeticulous/common` and the packages built on it (such
  as `@alwaysmeticulous/client`) still install and run on Node.js 18+.
  `@alwaysmeticulous/browser-installer`, `@alwaysmeticulous/record` and
  `@alwaysmeticulous/replay-orchestrator-launcher` now require Node.js 22.12 or
  newer. Chrome downloads keep honouring `HTTP_PROXY` / `HTTPS_PROXY`.

  The `meticulous` CLI bundles its dependencies and still runs on Node.js 18+,
  including `simulate`, `replay`, `record` and the replay debugger.
