# @alwaysmeticulous/browser-installer

## 3.11.0

### Patch Changes

- [#17295](https://github.com/alwaysmeticulous/meticulous/pull/17295) [`0068fd5`](https://github.com/alwaysmeticulous/meticulous/commit/0068fd5042b0110d8bd8490128e13f5da3157bf9) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Upgrade to puppeteer-core 25.16.0 and `@puppeteer/browsers` 3.2.6, so local replays and recordings
  download Chrome for Testing 156.0.8078.47 (was 154.0.8037.57), matching cloud replays.

  `@alwaysmeticulous/browser-installer` no longer depends on puppeteer-core at runtime: the Chrome
  build it installs is now a constant in the package.

  `@alwaysmeticulous/record` still depends on puppeteer-core, which since 25.13 depends on
  `chromium-bidi@157.0.8090-0`. From 157.0.8080-0 onwards, chromium-bidi is published without npm
  provenance (earlier versions had it), so pnpm projects with `trustPolicy: no-downgrade` reject it
  with `ERR_PNPM_TRUST_DOWNGRADE`. Puppeteer only loads chromium-bidi when launching Chrome with
  `protocol: "webDriverBiDi"`, which Meticulous never does. If your project hits this, either add
  `chromium-bidi@157.0.8090-0` to `trustPolicyExclude`, or remove the package with the pnpm override
  `"chromium-bidi": "-"` (the override isn't safe if you bundle puppeteer-core with esbuild, because
  esbuild follows puppeteer's import of chromium-bidi).

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
