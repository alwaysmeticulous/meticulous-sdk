# @alwaysmeticulous/browser-installer

## 2.350.0

### Patch Changes

- [#15283](https://github.com/alwaysmeticulous/meticulous/pull/15283) [`1a93140`](https://github.com/alwaysmeticulous/meticulous/commit/1a93140f24dc6f4c85d6ce9dbc6d9db53ffcbdec) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Upgrade to puppeteer-core 25.12.0 and `@puppeteer/browsers` 3.2.3, so local replays and recordings
  download Chrome for Testing 154.0.8037.57 (was 152.0.7977.75), matching cloud replays.

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
