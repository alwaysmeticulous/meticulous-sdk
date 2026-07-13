# @alwaysmeticulous/session-filters

## 2.308.0

### Patch Changes

- [#10945](https://github.com/alwaysmeticulous/meticulous/pull/10945) [`74afc3c`](https://github.com/alwaysmeticulous/meticulous/commit/74afc3c5c455c2a88e61e60be9ff9a11766a0ce8) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Load the native `re2` module lazily in `@alwaysmeticulous/session-filters`. Previously `re2` was imported at module load time, so it was required as soon as the CLI started (via the session-filter code path). In environments that skip native build scripts on install — e.g. `pnpm dlx` / `pnpx` under pnpm's strict build-script policy — the `re2.node` binary is never built, so the CLI crashed on startup with `Cannot find module './build/Release/re2.node'`. `re2` is now only required when a session filter is actually validated or compiled, so the CLI runs normally when session filters are not used.

## 2.307.0

### Patch Changes

- Updated dependencies [[`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b)]:
  - @alwaysmeticulous/api@2.307.0

## 2.306.0

### Minor Changes

- [#10727](https://github.com/alwaysmeticulous/meticulous/pull/10727) [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd) Thanks [@phreppo](https://github.com/phreppo)! - Add a `--sessionFilter` option to `ci run-with-uploaded-asset-chunks` that restricts the triggered test run to sessions whose start URL matches at least one of the provided RE2 regexes.

### Patch Changes

- Updated dependencies [[`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd)]:
  - @alwaysmeticulous/api@2.306.0
