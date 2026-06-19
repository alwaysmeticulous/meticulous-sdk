# Design: split `agent upload-build` from `agent trigger-test-run`

## Context

Today the custom-test-run flow is fused: `ci upload-assets` / `ci upload-container`
(and the merged `agent trigger-test-run` we just added) both **upload a build
and trigger a run in one call**. The backend mirrors this — `complete-asset-upload-and-maybe-trigger-run`
and `complete-container-upload` each create a `ProjectDeployment` *and* trigger
a test run.

The domain model already separates the two concepts:

- A **deployment** (`ProjectDeployment`) is a registered, servable build of the
  app at a commit — identified by `(project, source, sourceDeploymentId)`,
  carrying `commitSha`, `url`, and source-specific data (asset etag/archive type;
  container digest/port/env/healthcheck). Asset/container upload are 2 of ~7
  deployment sources (the rest are webhooks + secure tunnel).
- A **test run** is one execution against a deployment, comparing head↔base. It
  has no FK to the deployment; the link is by commit (`deployment.commitSha` →
  test run `execution_sha`) and `url`. **One deployment → many test runs**
  (re-trigger, base runs, sim-version reruns) — exactly how webhook deployments
  already behave.

We want the same decoupling for uploads: **`upload-build` registers a
reusable deployment and returns its id; `trigger-test-run` consumes that id and
triggers a run.** The build cost (push image / upload bundle) is paid once;
triggering stays cheap and repeatable.

## Ownership principle

`upload-build` sets everything **intrinsic to the build**. `trigger-test-run`
sets everything about the **comparison** (which is only meaningful relative to a
base chosen at trigger time).

`gitDiffOutput` and `baseSha` are comparison properties:

- `gitDiffOutput` is `git diff base..head`, used at test-run **preprocessing**
  for Relevant Session Execution (RSE) — selecting which recorded sessions to
  replay from the changed files. It is a function of `(base, head)`, only read
  during the run's preprocessing, and the backend even throws if a diff is given
  without a `baseSha`.
- One build can be compared against many bases → many diffs. So the diff cannot
  be a build property.
- Shipping the diff locally is what lets a custom run work **without pushing the
  head commit**: the head app is uploaded, and the diff is uploaded, so the
  backend never fetches the head from the remote. (Only the base — `origin/main`
  merge-base — needs to be reachable, and it is.)

## commitSha contract (new)

A deployment **requires** a `commitSha`, and from now on it must identify a
**real commit** so `commitSha` faithfully describes the build content (honest
`execution_sha`, dedup/cache by commit, clean two-commit diffs).

- Default `commitSha` = current `HEAD`.
- The commit need **not** be pushed: the head build and head diff are both
  uploaded; only the base must be reachable.
- **Dirty working tree** → auto-create an ephemeral commit with
  `git stash create` (a real, unreferenced commit object capturing index +
  working tree; HEAD and branch refs untouched), label the build with that SHA,
  and diff `base..<stash-sha>`. Print a one-line stderr warning:
  `note: working tree is dirty; using ephemeral commit <sha> to identify this build.`
- **Drop `withUncommittedChanges` and working-tree (`git diff <base>`) diffs**
  from the new path — the diff is always `base..head` between two real commits.

## CLI: `agent upload-build`

Registers a deployment (asset or container, auto-detected from flags) and prints
its identifier. No comparison/trigger args.

| Arg | Mode | Notes |
|---|---|---|
| `--apiToken` | both | auth |
| `--commitSha` | both | the commit the build is of; defaults to HEAD (or ephemeral `stash create` SHA when dirty) |
| `--repoDirectory` | both | convenience: infer `commitSha` from that repo's HEAD only |
| `--appDirectory` | assets | build payload |
| `--appZip` | assets | build payload |
| `--rewrites` | assets | asset-serving metadata (stored on the deployment) |
| `--localImageTag` | container | build payload |
| `--containerPort` | container | stored in `sourceSpecificData` |
| `--containerEnv` | container | stored in `sourceSpecificData` |
| `--containerHealthCheckEndpoint` | container | stored in `sourceSpecificData` |
| `--json` | both | structured output |

Auto-detect: `--localImageTag` ⇒ container; `--appDirectory`/`--appZip` ⇒ assets;
error on neither/both (reuse `detectUploadMode`).

**Returns** (stdout; `--json` for the full object):

```json
{
  "deploymentId": "<ProjectDeploymentId>",
  "source": "assetUpload" | "containerUpload",
  "commitSha": "<sha>"
}
```

`deploymentId` (the `ProjectDeployment` PK) is the only value `trigger-test-run`
needs. We deliberately do **not** return the upload-time `uploadId`
(`sourceDeploymentId`): with the deployment-keyed git-diff upload (below), the
trigger endpoint resolves the git-diff S3 location server-side from the
deployment's own `sourceDeploymentId`, so the client never handles it.
`source`/`commitSha` are echoed for readability only.

## CLI: `agent trigger-test-run`

Consumes a deployment id and triggers a run. Head commit comes from the
deployment, so `--commitSha` and all build flags are gone.

| Arg | Notes |
|---|---|
| `--apiToken` | auth |
| `--deploymentId` | **required**; output of `upload-build` |
| `--baseSha` | comparison target |
| `--gitDiffOutput` | `base..head`; requires `--baseSha` |
| `--repoDirectory` | convenience: infer `baseSha` (merge-base with `origin/main`) and `gitDiffOutput` (`base..head`, two commits) |
| `--waitForTestRunToComplete` | block until the run finishes — **default true** (`--no-waitForTestRunToComplete` to opt out) |
| `--json` | output |

There is no `--waitForBase` flag. The backend runs the base test run **in
parallel** with the head: when no base exists yet, `tryTriggerTestRunOnBaseCommit`
creates a `Partial` session-pool base and the head triggers immediately with its
`baseTestRunId` set, with base sessions executed on demand during head
preprocessing (`RequestBaseSessionsService`). So the trigger does not block
waiting for a base to exist; only "wait for the (head) test run to complete" is
user-configurable. (`mustHaveBase` is sent as `false`.)

**Returns**: `{ "testRunId": "...", "status": "..." }` (unchanged).

### Head vs base identity (intentional asymmetry)

- **Head** is identified by the explicit `--deploymentId` — "test exactly the
  build I just uploaded." `(project, commitSha)` is **non-unique** (multiple
  uploads, or upload + webhook deployments, can share a commit; each
  `upload-build` creates a new row with a new `sourceDeploymentId`), so a
  commit-keyed head would re-introduce the `findBestDeployment` guessing and
  could trigger a *stale* deployment. The id avoids this.
- **Base** is resolved by `(project, baseSha)`, not a passed id — you don't
  upload the base. The backend finds candidate deployments for `baseSha`
  (`ProjectDeployment` where `projectId` + `commitSha = baseSha` + `!isEphemeral`)
  and `findBestDeployment` picks the best match (same source+environment as the
  base test run's deployment → latest in env → latest overall). The base
  deployment is only needed when a base *test run* must be created; an existing
  base run for `baseSha` is used directly.

## Backend (agent namespace, in `../meticulous`) — implemented

New endpoints in `AgentDeploymentController` (`@Controller("agent")`, same
project/OAuth **write** auth as the project-deployment controller; test-run
tokens rejected). Each emits a Datadog usage counter via
`tracer.dogstatsd.increment(...)` with the standard project/caller tags. The
fused `project-deployments/complete-*` endpoints are untouched (deprecated path).

1. `POST agent/upload-build/asset` and `POST agent/upload-build/container` —
   finalize the upload (multipart complete + asset metadata / Harbor verify) and
   **create** the `ProjectDeployment` via
   `findOrCreateAndProcessProjectDeployment({ triggerCloudReplay: false })`,
   returning `{ deploymentId, source, commitSha }`. No trigger.
   Metric: `backend.agent.upload_build` (tag `mode: asset|container`).
2. `POST agent/trigger-test-run` — looks the deployment up by id
   (`findOneById`, scoped to the caller's project) and calls
   `processProjectDeployment` with the request's `baseSha`/`hasGitDiff`/
   `mustHaveBase` and the deployment's own `commitSha` as head.
   Metric: `backend.agent.trigger_test_run`.
3. `POST agent/upload-build/git-diff` — accepts `deploymentId`, resolves the
   git-diff S3 location server-side from the deployment's `sourceDeploymentId`,
   returns a presigned URL. The client never handles the upload id.
   Metric: `backend.agent.request_git_diff_upload`.

`withUncommittedChanges` remains supported by the trigger endpoint but the new
CLI path never sets it: a dirty tree is captured as a real `git stash create`
commit, so the diff is always `base..head` between two commits.

## SDK launcher split (`@alwaysmeticulous/remote-replay-launcher`)

Split the fused functions:

- `uploadBuild(...)` → push image / upload bundle + register deployment; returns
  `{ deploymentId, source, commitSha, uploadId }`. (Factor the asset vs container
  upload halves out of `uploadAssetsAndTriggerTestRun` / `uploadContainer`.)
- `triggerRun({ deploymentId, baseSha?, gitDiffOutput?, waitForBase })` → upload
  diff (if any) keyed by deployment + call the trigger endpoint; returns the
  test run. Keep the existing `pollWhileBaseNotFound` retry/fallback here.

The new `triggerTestRun` core (`packages/cli/src/commands/agent/trigger-test-run/`)
calls `triggerRun`; the new `uploadBuild` command calls `uploadBuild`.

## Deprecation

`ci upload-assets` / `ci upload-container` stay (already delegating to the fused
core) with their custom-trigger options deprecated. The merged
`agent trigger-test-run` we just shipped is superseded by this split
(upload-build + trigger-test-run); reconcile its surface to the trigger-only
shape above before release so we don't ship the fused agent command and then
break it.

## Edge cases / notes

- A local-only head commit is fine (head build + diff are uploaded; base is
  pushed). Reduced usefulness is only navigational (can't open on GitHub).
- The diff is only *consumed* when RSE engages (a base test run with coverage
  exists); otherwise it's uploaded but unused — orthogonal to push state.
- `git stash create` on a clean tree returns empty → fall back to HEAD.
- Dedup opportunity (future): with a faithful `commitSha`, `upload-build` could
  short-circuit if an identical deployment already exists.
