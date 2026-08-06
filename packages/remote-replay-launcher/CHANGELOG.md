# @alwaysmeticulous/remote-replay-launcher

## 2.323.0

### Patch Changes

- [#11668](https://github.com/alwaysmeticulous/meticulous/pull/11668) [`81aebb4`](https://github.com/alwaysmeticulous/meticulous/commit/81aebb44218d2a2a3a6d0240cd9ff5e66edbbc71) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Fix companion assets being registered with the wrong archive type. `--companionAssetsPathInImage` uploads a multipart `tar.d` archive but recorded `zip`, so replays looked for the bundle under a key that didn't exist; `--companionAssetsZip` had the inverse mismatch on the secure tunnel path. Each upload helper now reports the format it actually wrote, and the zip upload completes against the `zip` key rather than `tar.d`.

- [#11657](https://github.com/alwaysmeticulous/meticulous/pull/11657) [`1541c28`](https://github.com/alwaysmeticulous/meticulous/commit/1541c283cefc5015a0b210b2026547623edf843d) Thanks [@linpengzhang](https://github.com/linpengzhang)! - When no base test run is found, CLI base-fallback logs now say the test run is created without a base and that no sessions will be executed (instead of implying the run still proceeds).

- [#11653](https://github.com/alwaysmeticulous/meticulous/pull/11653) [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add a terminal `Skipped` test run status for runs that deliberately do not execute (e.g. when no base test run is available). The client sends a `clientVersion` on `getTestRun` so the backend can return `Skipped` to new clients and downgrade it to `Aborted` for pinned older CLIs.

- Updated dependencies [[`583b59c`](https://github.com/alwaysmeticulous/meticulous/commit/583b59c9d32fa3c21575765f8475a00f315d7b1d), [`a579631`](https://github.com/alwaysmeticulous/meticulous/commit/a579631e702203e78c81435b43162efec60893cf), [`15c3c0a`](https://github.com/alwaysmeticulous/meticulous/commit/15c3c0a1d173992db7963bf7f6bfc00831d26157), [`4c2c367`](https://github.com/alwaysmeticulous/meticulous/commit/4c2c367837bd717fcaa471730b3ac8c9224766d8), [`0ef2f27`](https://github.com/alwaysmeticulous/meticulous/commit/0ef2f27855381b29551b3f7b90ac92b6ed03e92d), [`672e710`](https://github.com/alwaysmeticulous/meticulous/commit/672e710e504b843d84ea0dae85612390b2b0ad26), [`fed0068`](https://github.com/alwaysmeticulous/meticulous/commit/fed00687ed753102ecaad6e5f5aabbf089e5e9f1), [`54741e1`](https://github.com/alwaysmeticulous/meticulous/commit/54741e1ab73a0e2ffa40e59eb7a0f8340b309095), [`2c15475`](https://github.com/alwaysmeticulous/meticulous/commit/2c15475d9661cd496699f07901fd487800b717d1), [`8346ef7`](https://github.com/alwaysmeticulous/meticulous/commit/8346ef7ff80d1e24f1ce692a61789083a0cb187e), [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c)]:
  - @alwaysmeticulous/client@2.323.0
  - @alwaysmeticulous/common@2.323.0
  - @alwaysmeticulous/api@2.323.0
  - @alwaysmeticulous/tunnels-client@2.323.0

## 2.322.0

### Minor Changes

- [#11624](https://github.com/alwaysmeticulous/meticulous/pull/11624) [`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Support companion assets when uploading a Docker container. Previously `--companionAssetsFolder`/`--companionAssetsZip`/`--companionAssetsRegex` only worked with `ci run-with-tunnel`; `ci upload-container` now accepts the same flags, plus a new `--companionAssetsPathInImage` to serve a bundle straight out of a path inside the uploaded image itself, with no local copy needed.

### Patch Changes

- Updated dependencies [[`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56)]:
  - @alwaysmeticulous/client@2.322.0

## 2.321.0

### Patch Changes

- Updated dependencies [[`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722), [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1), [`b5b2c6b`](https://github.com/alwaysmeticulous/meticulous/commit/b5b2c6ba1b85d3e5c8090802b9c947bcb98a5734), [`3096d56`](https://github.com/alwaysmeticulous/meticulous/commit/3096d56bbb7341fd2af918050bf59496b9a57e28)]:
  - @alwaysmeticulous/api@2.321.0
  - @alwaysmeticulous/common@2.321.0
  - @alwaysmeticulous/client@2.321.0
  - @alwaysmeticulous/tunnels-client@2.321.0

## 2.320.0

### Patch Changes

- Updated dependencies [[`70bac9c`](https://github.com/alwaysmeticulous/meticulous/commit/70bac9c3859ae034b3acccc059323cdc313b1873)]:
  - @alwaysmeticulous/client@2.320.0

## 2.319.0

### Patch Changes

- Updated dependencies [[`539f672`](https://github.com/alwaysmeticulous/meticulous/commit/539f672e598db9270ac5014dc43632a08b827fa5), [`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9), [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b)]:
  - @alwaysmeticulous/client@2.319.0
  - @alwaysmeticulous/api@2.319.0
  - @alwaysmeticulous/common@2.310.0

## 2.318.0

### Patch Changes

- Updated dependencies [[`8e70c70`](https://github.com/alwaysmeticulous/meticulous/commit/8e70c70c295cf5f34374a19b218b0711dd2ad260), [`d9267a0`](https://github.com/alwaysmeticulous/meticulous/commit/d9267a01c67a677f21f1d7e3dcdf4936633d6616)]:
  - @alwaysmeticulous/client@2.318.0

## 2.316.1

### Patch Changes

- Updated dependencies [[`4fa92e5`](https://github.com/alwaysmeticulous/meticulous/commit/4fa92e5017b750814239ecf2d10443b9dfd560ba), [`ee12bbe`](https://github.com/alwaysmeticulous/meticulous/commit/ee12bbea3fa268e30ac6bf6d335fbef694ee3287)]:
  - @alwaysmeticulous/client@2.316.1

## 2.316.0

### Minor Changes

- [#11448](https://github.com/alwaysmeticulous/meticulous/pull/11448) [`061d6fb`](https://github.com/alwaysmeticulous/meticulous/commit/061d6fb0038caa690245acbbbe66248fe9386bef) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Allow container-based agentic PR tests to use recorded-session network mocks.

### Patch Changes

- Updated dependencies [[`b20dc05`](https://github.com/alwaysmeticulous/meticulous/commit/b20dc05866f60875b8589e4e8ac7837c07da542c), [`80151d6`](https://github.com/alwaysmeticulous/meticulous/commit/80151d63704a7acae0c157d112cb39825c1ce287), [`6ba0dd6`](https://github.com/alwaysmeticulous/meticulous/commit/6ba0dd62bc7cba90c344e80b6167a2c1c3ee9e56), [`777bfaf`](https://github.com/alwaysmeticulous/meticulous/commit/777bfaf0c3c169a367b3bba7244973023a2908f3), [`061d6fb`](https://github.com/alwaysmeticulous/meticulous/commit/061d6fb0038caa690245acbbbe66248fe9386bef)]:
  - @alwaysmeticulous/client@2.316.0
  - @alwaysmeticulous/common@2.310.0

## 2.315.0

### Patch Changes

- Updated dependencies [[`62f456b`](https://github.com/alwaysmeticulous/meticulous/commit/62f456b0587d1fbed430e532b25bfabd7e2a4c93), [`e021d1c`](https://github.com/alwaysmeticulous/meticulous/commit/e021d1c4d587c629f1d67a5deb85bb6243608505), [`95053ea`](https://github.com/alwaysmeticulous/meticulous/commit/95053ea5c096a25076452e32ac9e8b07f8ce3fe7), [`5931dfd`](https://github.com/alwaysmeticulous/meticulous/commit/5931dfd6fd798e1a45cf5f507005e71e9018396f), [`f3c5e3b`](https://github.com/alwaysmeticulous/meticulous/commit/f3c5e3b77edd8cd1cf9de3c1e28c308a86247a45)]:
  - @alwaysmeticulous/client@2.315.0
  - @alwaysmeticulous/common@2.310.0

## 2.314.0

### Patch Changes

- Updated dependencies [[`21b5979`](https://github.com/alwaysmeticulous/meticulous/commit/21b59793a2e0819f70062b544879abae43b023c9)]:
  - @alwaysmeticulous/client@2.314.0

## 2.313.1

### Patch Changes

- [#11314](https://github.com/alwaysmeticulous/meticulous/pull/11314) [`47f4c67`](https://github.com/alwaysmeticulous/meticulous/commit/47f4c6784db1ef66a2a11a8806549909d38c227d) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Allow the CLI and client to proceed without an API token, omitting the Authorization header so environments that inject auth can work. On 401/403 responses when no token was sent, surface guidance that authentication is probably missing.

- Updated dependencies [[`47f4c67`](https://github.com/alwaysmeticulous/meticulous/commit/47f4c6784db1ef66a2a11a8806549909d38c227d)]:
  - @alwaysmeticulous/client@2.313.1
  - @alwaysmeticulous/tunnels-client@2.313.1

## 2.313.0

### Minor Changes

- [#11208](https://github.com/alwaysmeticulous/meticulous/pull/11208) [`3eaa104`](https://github.com/alwaysmeticulous/meticulous/commit/3eaa10473902958c66bc903bb98c3ad35bd10f6b) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add an uploaded-assets mode to agentic PR-time testing. The new `meticulous ci agent-test` command accepts exactly one of `--localImageTag`, `--assetsDir`, or `--assetsUploadId`, plus an optional `--backendUrl` pointing at a customer staging backend (credentials are read from `METICULOUS_STAGING_USERNAME` / `METICULOUS_STAGING_PASSWORD`, proxied path prefixes from `--backendProxyPaths`, default `/api`). With assets targets the agent worker serves the uploaded frontend itself and either reverse-proxies API calls to the staging backend or stubs them from recorded sessions when no backend is given. The client gains the `AgenticAppTarget` discriminated union (`container` / `assets`) and `AgenticAssetsBackend` types, and `remote-replay-launcher`'s `generateSessions` can now upload an assets directory (or reuse an existing upload) instead of a container image.

### Patch Changes

- Updated dependencies [[`b72db94`](https://github.com/alwaysmeticulous/meticulous/commit/b72db94c764ca46ee0bd2d71fe5b4c2e9a0ef05f), [`3eaa104`](https://github.com/alwaysmeticulous/meticulous/commit/3eaa10473902958c66bc903bb98c3ad35bd10f6b), [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046), [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046)]:
  - @alwaysmeticulous/client@2.313.0

## 2.312.0

### Patch Changes

- Updated dependencies [[`d1ba630`](https://github.com/alwaysmeticulous/meticulous/commit/d1ba63009cdcb1227f9bdfe03af27a87ca7f819b), [`a45a77f`](https://github.com/alwaysmeticulous/meticulous/commit/a45a77f8157baa074cea216cdb9c620066750187), [`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c)]:
  - @alwaysmeticulous/client@2.312.0
  - @alwaysmeticulous/api@2.312.0
  - @alwaysmeticulous/common@2.310.0

## 2.311.0

### Patch Changes

- Updated dependencies [[`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91), [`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91), [`eeb76d2`](https://github.com/alwaysmeticulous/meticulous/commit/eeb76d2d381179852f572e54f99a0d644dcd3770)]:
  - @alwaysmeticulous/client@2.311.0

## 2.310.0

### Minor Changes

- [#11071](https://github.com/alwaysmeticulous/meticulous/pull/11071) [`7ee1f36`](https://github.com/alwaysmeticulous/meticulous/commit/7ee1f361af4bcc76a3a1da96c216c658cf992594) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `--maxDurationSeconds` to `meticulous agent trigger-test-run` to cap each replay's duration for explicitly pinned `--sessionIds`, overriding the project's configured cap (defaults to 300s/5min; pass `none` for unlimited — useful for newly custom-recorded sessions with unusually long flows). A trimmed session now surfaces as a neutral, informational entry in its replay timeline (it does not count towards session-health warnings or register as a diff/divergence).

### Patch Changes

- [#10444](https://github.com/alwaysmeticulous/meticulous/pull/10444) [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Decouple agentic instructions from the deployment: they are now uploaded per-trigger to the pr-test-pilot bucket and correlated to the run by a server-minted `instructionsId` (returned from `requestAgenticInstructionsUpload`), rather than stored under the deployment's `uploadId`. `requestAgenticInstructionsUpload` now posts to `agentic-session-generation/request-instructions-upload` (dropping `uploadId`, returning `{ uploadUrl, instructionsId }`), and `completeAgenticSessionGeneration` posts to `agentic-session-generation/launch` and takes an optional `instructionsId` in place of `hasInstructions`.

- [#10709](https://github.com/alwaysmeticulous/meticulous/pull/10709) [`6e8ee26`](https://github.com/alwaysmeticulous/meticulous/commit/6e8ee260645ef3f97406f6ff459607a0c2925b51) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `ci run-with-uploaded-asset-chunks` now accepts `{ name, versionLookup: "latest-in-history" }` entries in its asset references manifest, resolving unchanged chunks from the base test run's history. `baseSha` is optional for such manifests — the backend infers the base it will compare the run against (recommended, since user-supplied base SHAs are easy to get wrong for PRs), and `baseSha` only overrides it. The CLI rejects duplicate chunk names and prints resolved chunk path overlaps as last-wins warnings. The remote replay launcher skips the pointless no-base fallback for `versionLookup` manifests, surfacing an actionable message instead.

- Updated dependencies [[`2e0a336`](https://github.com/alwaysmeticulous/meticulous/commit/2e0a336a9366dc0bb81a3d18e4c577a6a6a4261b), [`7ee1f36`](https://github.com/alwaysmeticulous/meticulous/commit/7ee1f361af4bcc76a3a1da96c216c658cf992594), [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882), [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882), [`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e), [`0d35d4d`](https://github.com/alwaysmeticulous/meticulous/commit/0d35d4d136ea4b0d5a7c0395189203e5831b6081), [`c500bb7`](https://github.com/alwaysmeticulous/meticulous/commit/c500bb70a38d0d019727e30f7613a6305a0c01ca)]:
  - @alwaysmeticulous/client@2.310.0
  - @alwaysmeticulous/api@2.310.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/tunnels-client@2.310.0

## 2.308.0

### Patch Changes

- Updated dependencies [[`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37), [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37)]:
  - @alwaysmeticulous/client@2.308.0

## 2.307.0

### Minor Changes

- [#10853](https://github.com/alwaysmeticulous/meticulous/pull/10853) [`09610cb`](https://github.com/alwaysmeticulous/meticulous/commit/09610cb51b85bc763123b537917a19e04d09aa10) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous auth set-project` now persists the selected project as a per-user setting on the backend, instead of in a local file — so it's consistent across machines and visible to the hosted MCP server, which has no access to local files. A new `meticulous auth get-project` prints the resolved project for scripting. `meticulous auth login` selects a project after logging in: an explicit `--project` (or, interactively, the picker) is persisted, a sole accessible project is auto-selected, and an existing default is respected as-is — so a returning `--non-interactive` login succeeds instead of failing for lack of a picker. `--project` on both `set-project` and `login` accepts a bare id, an `organization/name` slug, or a unique bare name (resolved server-side), not just the full slug. `meticulous auth logout` leaves the backend setting untouched (it's account state, not machine state). On the first OAuth-authenticated command after upgrading, any existing local `selected-project.json` is migrated to the backend setting once and then removed. The default can be changed but not cleared from the UI/CLI (the choice is always _which_ project, never none).

  `@alwaysmeticulous/client` gains `getOAuthDefaultProject`, `setOAuthDefaultProject`, and `resolveDefaultProjectId`; it no longer exports `getStoredProjectId`, `getStoredProject`, `setStoredProject`, or `clearStoredProject` (the removed local-file-backed project storage).

  `meticulous agent test-run-for-commit`, `test-run-diffs`, `js-coverage`, and `trigger-test-run` gain a `--project` flag: a one-off override for that call only (resolved flexibly — id, `organization/name` slug, or a unique bare name among your accessible projects), which never changes the stored default. When omitted, these commands now rely entirely on the backend's own project resolution (the token's project, or the stored default) rather than pre-resolving one locally.

### Patch Changes

- Updated dependencies [[`73b0b40`](https://github.com/alwaysmeticulous/meticulous/commit/73b0b401960bdd2e5f7b87aa3ac8d8f05f6f156e), [`09610cb`](https://github.com/alwaysmeticulous/meticulous/commit/09610cb51b85bc763123b537917a19e04d09aa10), [`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b)]:
  - @alwaysmeticulous/client@2.307.0
  - @alwaysmeticulous/api@2.307.0
  - @alwaysmeticulous/common@2.301.0

## 2.306.0

### Minor Changes

- [#10727](https://github.com/alwaysmeticulous/meticulous/pull/10727) [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd) Thanks [@phreppo](https://github.com/phreppo)! - Add a `--sessionFilter` option to `ci run-with-uploaded-asset-chunks` that restricts the triggered test run to sessions whose start URL matches at least one of the provided RE2 regexes.

### Patch Changes

- Updated dependencies [[`c9dfd16`](https://github.com/alwaysmeticulous/meticulous/commit/c9dfd16bf6114470782e73362989fe9c97c2698f), [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd), [`d493a2a`](https://github.com/alwaysmeticulous/meticulous/commit/d493a2a6fe7e931f09b32e8dbfe4b191aa103cab)]:
  - @alwaysmeticulous/client@2.306.0
  - @alwaysmeticulous/api@2.306.0
  - @alwaysmeticulous/common@2.301.0

## 2.305.0

### Patch Changes

- [#10535](https://github.com/alwaysmeticulous/meticulous/pull/10535) [`ec6ab46`](https://github.com/alwaysmeticulous/meticulous/commit/ec6ab46b9685d8cb10dbb7bfac7442897a2caa57) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add `RequestedProjectAssetChunkReference` so chunked-asset-upload manifests may
  include `{ name, versionLookup: "latest-in-history" }` entries alongside
  concrete `{ name, versionId }` references. The server resolves lookups from
  ancestor test runs during deployment processing. Chunk path overlaps are
  computed once, over the fully-resolved manifest, and returned from the trigger
  response, so collisions involving resolved `versionLookup` entries are surfaced
  rather than silently dropped.
- Updated dependencies [[`ec6ab46`](https://github.com/alwaysmeticulous/meticulous/commit/ec6ab46b9685d8cb10dbb7bfac7442897a2caa57)]:
  - @alwaysmeticulous/client@2.305.0
  - @alwaysmeticulous/common@2.301.0

## 2.304.0

### Minor Changes

- [#10586](https://github.com/alwaysmeticulous/meticulous/pull/10586) [`879b04e`](https://github.com/alwaysmeticulous/meticulous/commit/879b04eac5966890f2b0d6f2aabf1ae139782f8d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` can now attach a git diff (`--gitDiffOutput`, or one inferred via `--repoDirectory`) when identifying the build by `--commitSha` instead of `--deploymentId`. The diff upload resolves the commit to a deployment server-side, and that resolved deployment is then reused for the trigger call, so both requests target the same deployment row.

### Patch Changes

- Updated dependencies [[`879b04e`](https://github.com/alwaysmeticulous/meticulous/commit/879b04eac5966890f2b0d6f2aabf1ae139782f8d), [`ae26bff`](https://github.com/alwaysmeticulous/meticulous/commit/ae26bff26f73209ff0ea4fca2b014d094be344d6), [`950002e`](https://github.com/alwaysmeticulous/meticulous/commit/950002e88fa27063fb1cb3d631052cbfd6dbd8bb)]:
  - @alwaysmeticulous/client@2.304.0

## 2.303.1

### Patch Changes

- Updated dependencies [[`5ae77f3`](https://github.com/alwaysmeticulous/meticulous/commit/5ae77f305b7cbd59174f7e5e73c454ece794099f)]:
  - @alwaysmeticulous/client@2.303.1
  - @alwaysmeticulous/common@2.301.0

## 2.302.0

### Minor Changes

- [#10524](https://github.com/alwaysmeticulous/meticulous/pull/10524) [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` now accepts `--commitSha` as an alternative to
  `--deploymentId`: it resolves to the most recent non-ephemeral deployment
  already uploaded for that commit in the project (e.g. by an earlier CI run),
  so you don't need to look up a `deploymentId` to re-trigger a run — for
  example to test the coverage impact of `--sessionIds` against a commit that
  has already gone through Meticulous. Exactly one of `--deploymentId` or
  `--commitSha` is required. `--commitSha` cannot be combined with a git diff
  (`--gitDiffOutput`, or one inferred via `--repoDirectory`), since uploading a
  diff requires an already-known deployment to key it by.

- [#10524](https://github.com/alwaysmeticulous/meticulous/pull/10524) [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add an optional `--sessionIds` argument to `agent trigger-test-run`. When
  provided (a comma-separated list of session IDs), the run replays exactly those
  sessions — for both the base and the head — instead of the project's
  auto-selected ("golden set") sessions. When omitted, behaviour is unchanged.
  An explicitly-provided list that is empty or contains duplicate session IDs is
  rejected up front (at the agent endpoint) rather than silently falling back to
  the golden set or de-duplicating.

  Note: as part of this change, externally-supplied session IDs (the agent
  `--sessionIds` trigger and the `meticulous.json` `testCases` list consumed by the
  legacy `addTestRun` endpoint) are now validated to exist and belong to the
  project before a run is created. A request referencing an unknown, deleted, or
  cross-project session ID is now rejected with a `400` instead of having that one
  session silently dropped — so an out-of-date `meticulous.json` session list that
  previously degraded gracefully will now fail the request until the stale IDs are
  removed. (Duplicate-session rejection applies only to the agent `--sessionIds`
  trigger; the legacy path continues to de-duplicate silently.)

### Patch Changes

- Updated dependencies [[`132ce89`](https://github.com/alwaysmeticulous/meticulous/commit/132ce893095bc0eb89abb000ae4982f3fed85355), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`41ae1dd`](https://github.com/alwaysmeticulous/meticulous/commit/41ae1dd2a01114677015abfbe905192b46aea471), [`d78f1a9`](https://github.com/alwaysmeticulous/meticulous/commit/d78f1a9f54461825700ffff970ddb0bf77c8da67)]:
  - @alwaysmeticulous/client@2.302.0
  - @alwaysmeticulous/common@2.301.0

## 2.301.0

### Minor Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

### Patch Changes

- Updated dependencies [[`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f)]:
  - @alwaysmeticulous/client@2.301.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/api@2.301.0
  - @alwaysmeticulous/tunnels-client@2.301.0

## 2.300.0

### Patch Changes

- Updated dependencies [[`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740), [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d)]:
  - @alwaysmeticulous/api@2.300.0
  - @alwaysmeticulous/common@2.300.0
  - @alwaysmeticulous/client@2.300.0
  - @alwaysmeticulous/tunnels-client@2.300.0

## 2.299.0

### Patch Changes

- Updated dependencies [[`4406b07`](https://github.com/alwaysmeticulous/meticulous/commit/4406b07d938d31583e87e80c3a7d3da658e695ce), [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c)]:
  - @alwaysmeticulous/client@2.299.0
  - @alwaysmeticulous/common@2.299.0
  - @alwaysmeticulous/tunnels-client@2.299.0

## 2.298.1

### Patch Changes

- [#10259](https://github.com/alwaysmeticulous/meticulous/pull/10259) [`43dc613`](https://github.com/alwaysmeticulous/meticulous/commit/43dc613a33a90a6334b759336303fb3a015dee88) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op test change

## 2.298.0

### Patch Changes

- Updated dependencies [[`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d), [`27df430`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/27df430046651864302df98d548a8a91df069521)]:
  - @alwaysmeticulous/client@2.298.0
  - @alwaysmeticulous/common@2.298.0
  - @alwaysmeticulous/tunnels-client@2.298.0

## 2.297.1

### Patch Changes

- Updated dependencies [[`142a03f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/142a03f40c4c535014b01c65cbf0a2ab4f4f0240)]:
  - @alwaysmeticulous/client@2.297.1

## 2.297.0

### Minor Changes

- [#1171](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1171) [`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55) Thanks [@sesajad](https://github.com/sesajad)! - Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/client@2.297.0
  - @alwaysmeticulous/api@2.297.0
  - @alwaysmeticulous/common@2.293.0

## 2.296.0

### Patch Changes

- Updated dependencies [[`bfee3f0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/bfee3f0e146549ecfd652e58e628a5a45fa4c0f4)]:
  - @alwaysmeticulous/client@2.296.0

## 2.295.0

### Patch Changes

- Updated dependencies [[`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/api@2.295.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.295.0

## 2.294.0

### Patch Changes

- Updated dependencies [[`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/api@2.294.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.294.0

## 2.293.1

### Patch Changes

- Updated dependencies [[`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9)]:
  - @alwaysmeticulous/client@2.293.1

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4), [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/client@2.293.0
  - @alwaysmeticulous/tunnels-client@2.293.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/api@2.293.0

## 2.292.1

### Patch Changes

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1
  - @alwaysmeticulous/client@2.292.1
  - @alwaysmeticulous/common@2.290.3

## 2.292.0

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec)]:
  - @alwaysmeticulous/api@2.292.0
  - @alwaysmeticulous/client@2.292.0
  - @alwaysmeticulous/common@2.290.3

## 2.291.2

### Patch Changes

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/api@2.291.2
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.291.2

## 2.291.0

### Patch Changes

- Updated dependencies [[`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b)]:
  - @alwaysmeticulous/client@2.291.0

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.290.3
  - @alwaysmeticulous/tunnels-client@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/client@2.290.2
  - @alwaysmeticulous/common@2.287.1

## 2.290.0

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/client@2.290.0
  - @alwaysmeticulous/common@2.287.1

## 2.289.2

### Patch Changes

- Updated dependencies [[`8731225`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/8731225adb4cf22c9d1341972583931369c17882)]:
  - @alwaysmeticulous/client@2.289.2

## 2.289.1

### Patch Changes

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1
  - @alwaysmeticulous/client@2.289.1
  - @alwaysmeticulous/common@2.287.1

## 2.289.0

### Patch Changes

- Updated dependencies [[`966e0b0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/966e0b0e110442a552aa0937c0570db7defd38a8)]:
  - @alwaysmeticulous/client@2.289.0

## 2.288.2

### Patch Changes

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2
  - @alwaysmeticulous/client@2.288.2
  - @alwaysmeticulous/common@2.287.1

## 2.288.1

### Patch Changes

- Updated dependencies [[`4e97f21`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/4e97f216670021a925f8beac64657985180a6edc)]:
  - @alwaysmeticulous/client@2.288.1

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0
  - @alwaysmeticulous/client@2.288.0
  - @alwaysmeticulous/common@2.287.1

## 2.287.1

### Patch Changes

- Updated dependencies [[`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7)]:
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/client@2.287.1
  - @alwaysmeticulous/tunnels-client@2.287.1

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0
  - @alwaysmeticulous/client@2.286.0
  - @alwaysmeticulous/common@2.283.1

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2
  - @alwaysmeticulous/client@2.285.2
  - @alwaysmeticulous/common@2.283.1

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1
  - @alwaysmeticulous/client@2.285.1
  - @alwaysmeticulous/common@2.283.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0
  - @alwaysmeticulous/client@2.285.0
  - @alwaysmeticulous/common@2.283.1

## 2.284.0

### Patch Changes

- Updated dependencies [[`60154f4`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/60154f4e5a901423bf28e3deb37f5a6164d83ad3)]:
  - @alwaysmeticulous/client@2.284.0

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/tunnels-client@2.283.1
  - @alwaysmeticulous/client@2.283.1
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/api@2.283.1

## 2.283.0

### Patch Changes

- Updated dependencies [[`0806546`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0806546254d3e63167b7406dc1cf8483a06c4003)]:
  - @alwaysmeticulous/client@2.283.0

## 2.281.0

### Patch Changes

- Updated dependencies [[`f6f780e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f6f780ebd294643d3d0f659187af4b4e624477aa)]:
  - @alwaysmeticulous/client@2.281.0
