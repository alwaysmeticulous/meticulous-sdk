# @alwaysmeticulous/session-filters

## 2.336.0

### Patch Changes

- Updated dependencies [[`f17af6e`](https://github.com/alwaysmeticulous/meticulous/commit/f17af6e22eef995d432d1c4fabbc278e6ea32743), [`f4c8e15`](https://github.com/alwaysmeticulous/meticulous/commit/f4c8e15932d055ef966a3686c811f1f9b4ee56e1)]:
  - @alwaysmeticulous/api@2.336.0

## 2.334.0

### Patch Changes

- Updated dependencies [[`a169be3`](https://github.com/alwaysmeticulous/meticulous/commit/a169be364e19cda80cd24b21181ab3c373ba59a0)]:
  - @alwaysmeticulous/api@2.334.0

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

- Updated dependencies [[`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df)]:
  - @alwaysmeticulous/api@2.333.1

## 2.332.0

### Patch Changes

- Updated dependencies [[`b7dde7f`](https://github.com/alwaysmeticulous/meticulous/commit/b7dde7f8f95bddb959fe548610762864dd67f63d), [`b7dde7f`](https://github.com/alwaysmeticulous/meticulous/commit/b7dde7f8f95bddb959fe548610762864dd67f63d), [`a6943e7`](https://github.com/alwaysmeticulous/meticulous/commit/a6943e7d1519193a2958a3129091f6bc80abe8a4), [`65a40b1`](https://github.com/alwaysmeticulous/meticulous/commit/65a40b11a270fd5acfad66d6418140dee1426f10)]:
  - @alwaysmeticulous/api@2.332.0

## 2.327.0

### Patch Changes

- Updated dependencies [[`18f08df`](https://github.com/alwaysmeticulous/meticulous/commit/18f08df1169dadd792e1b20308e092e5611a2c79), [`ea7d1b4`](https://github.com/alwaysmeticulous/meticulous/commit/ea7d1b40ec04a6e876d9312e8d2385dc619c4e93)]:
  - @alwaysmeticulous/api@2.327.0

## 2.326.0

### Patch Changes

- Updated dependencies [[`bc5e33d`](https://github.com/alwaysmeticulous/meticulous/commit/bc5e33df47f22fc88fe956b4c1202163dc4fa813), [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7)]:
  - @alwaysmeticulous/api@2.326.0

## 2.324.0

### Patch Changes

- [#11908](https://github.com/alwaysmeticulous/meticulous/pull/11908) [`4d402a0`](https://github.com/alwaysmeticulous/meticulous/commit/4d402a0dba16ed5d9cbc1df300e2d498cd974a1b) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - Raise the maximum number of regexes allowed in a session filter from 100 to 500.

- Updated dependencies [[`297a0f5`](https://github.com/alwaysmeticulous/meticulous/commit/297a0f57c2acbb26e48c8f346b463f240212941f), [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297)]:
  - @alwaysmeticulous/api@2.324.0

## 2.323.0

### Patch Changes

- Updated dependencies [[`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c)]:
  - @alwaysmeticulous/api@2.323.0

## 2.321.0

### Patch Changes

- Updated dependencies [[`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722)]:
  - @alwaysmeticulous/api@2.321.0

## 2.319.0

### Patch Changes

- Updated dependencies [[`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9), [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b)]:
  - @alwaysmeticulous/api@2.319.0

## 2.312.0

### Patch Changes

- Updated dependencies [[`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c)]:
  - @alwaysmeticulous/api@2.312.0

## 2.310.0

### Patch Changes

- Updated dependencies [[`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e)]:
  - @alwaysmeticulous/api@2.310.0

## 2.309.0

### Minor Changes

- [#10951](https://github.com/alwaysmeticulous/meticulous/pull/10951) [`13c087b`](https://github.com/alwaysmeticulous/meticulous/commit/13c087b6b3f1610526826a70526ff6b7e0a15b8a) Thanks [@phreppo](https://github.com/phreppo)! - Remove the native `re2` dependency from `@alwaysmeticulous/session-filters`, including the exported `compileSessionFilter` function (breaking change for any direct consumers of that export). Session filter regexes are no longer compiled client-side — the backend already validates regex syntax with RE2 at the API boundary and returns a clear error if compilation fails, so client-side compilation was redundant and required bundling/building the native `re2` module. The CLI and backend now only perform structural validation (e.g. length, count) client-side.

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
