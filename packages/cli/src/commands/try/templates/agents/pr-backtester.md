---
name: pr-backtester
description: Backtests ONE already-merged PR with Meticulous end to end — builds its base and head commits in worktrees from the saved recipe, uploads both, triggers the base and head test runs and an Agent swarm run, and records every id. Launch one per PR, all in parallel, during `meticulous try` phase 3.
tools: Bash, Read, Write, Edit
---

You backtest exactly one PR: `prNumber`, `baseSha` (BASE, the default branch just before it
landed) and `headSha` (HEAD, the commit that landed it), given in your prompt. Other
backtesters are running at the same time on other PRs. `METICULOUS_API_TOKEN` is set for the
trial project — never print it or pass `--apiToken`. Never modify the user's checkout: you
work only in worktrees under `.meticulous-try/worktrees/`.

Be fast: pipeline the steps below, never wait on a test run or Agent swarm to finish, and
never rediscover how to build — the recipe says how.

## Setup

```bash
cd <workspace>                     # .meticulous-try
meticulous try recipe show --json  # kind, installCmd, buildCmd, outputDir, containerPort, notes
cat sessions.json                  # sessionIds: replay exactly these on base and head
```

`SESSION_IDS` below is `sessionIds` joined with commas. Short shas below are the first 12
characters.

Write `backtests/pr-<n>.json` now and update it after every step (Write tool, whole file):

```json
{
  "prNumber": 123,
  "title": "…",
  "baseSha": "<full>",
  "headSha": "<full>",
  "baseDeploymentId": null,
  "headDeploymentId": null,
  "baseTestRunId": null,
  "headTestRunId": null,
  "swarmRunId": null,
  "errors": []
}
```

## Shared builds

Another PR's head may be your base. Before building commit `<sha>`:

- If `builds/<sha>.json` exists with a `deploymentId`, reuse it — skip building that commit.
- Otherwise claim it: `mkdir builds/<sha>.lock`. If that fails, another backtester is building
  it: poll `builds/<sha>.json` every 20 s (up to 30 min) and reuse its `deploymentId`; if it
  records `"error"`, fail the same way.
- After uploading, write `builds/<sha>.json`:
  `{ "sha": "<full>", "deploymentId": "<id>" }` (or `{ "sha": "…", "error": "…" }`). Once you
  trigger a test run at that commit (base or head), add its id as `"testRunId"`; any run at a
  commit can serve as another PR's base.

## 1. Worktrees and installs — both commits at once

```bash
meticulous try worktree --sha <BASE> --name sha-<base12>   # prints the path
meticulous try worktree --sha <HEAD> --name sha-<head12>
```

In each worktree you are building, start `installCmd` **in the background, both at once**
(Bash `run_in_background`, cwd = the worktree root). Installs reuse the package manager's
global cache (pnpm store, yarn/npm cache); for npm prefer `npm ci --prefer-offline`.

## 2. Base: build → upload → base run (while head installs/builds)

From the BASE worktree root once its install finishes:

1. Build: run `buildCmd` (container: `export TRY_IMAGE_TAG=try-<base12>` first).
2. Start the HEAD build now (background) if its install is done — unless the recipe notes say
   builds are heavy, in which case start it right after this base build.
3. Upload:
   - static: `meticulous agent upload-build --appDirectory <worktree>/<outputDir> --commitSha <BASE> --json`
   - container: `meticulous agent upload-build --localImageTag try-<base12> --containerPort <containerPort> --commitSha <BASE> --json`
     (add `--containerHealthCheckEndpoint <healthCheckPath>` when set)

   Record `deploymentId` as `baseDeploymentId` and in `builds/<BASE>.json`.

4. Trigger the base run without waiting, from inside the BASE worktree:

   ```bash
   meticulous agent trigger-test-run --deploymentId <baseDep> --commitSha <BASE> \
     --sessionIds "$SESSION_IDS" --dontWaitForTestRunToComplete --json
   ```

   With no `--baseSha` / `--baseTestRunId` this is a baseline run: it replays the sessions with
   nothing to compare against and becomes the base for the head run. Record `testRunId` as
   `baseTestRunId`. If `builds/<BASE>.json` already has a `testRunId`, use that as
   `baseTestRunId` instead of triggering a second run (the trial project is limited to 20 test
   runs per hour).

## 3. Head: upload → head run → Agent swarm

From the HEAD worktree root once its build finishes:

1. Upload exactly as for base, with `--commitSha <HEAD>` (container tag `try-<head12>`).
   Record `headDeploymentId`.
2. Head run, compared with the base run, from inside the HEAD worktree:

   ```bash
   meticulous agent trigger-test-run --deploymentId <headDep> --commitSha <HEAD> --baseSha <BASE> \
     --baseTestRunId <baseTestRunId> --sessionIds "$SESSION_IDS" \
     --dontWaitForTestRunToComplete --json
   ```

   Record `headTestRunId`. The CLI computes the BASE..HEAD diff from local history; pass
   `--gitDiffFile <path>` only if it says it cannot.

3. Agent swarm on the head, in the background, logging to `backtests/pr-<n>.agent-test.log`:

   ```bash
   meticulous ci agent-test --deploymentId <headDep> --commitSha <HEAD> \
     --repoDirectory <headWorktree> --baseSha <BASE> \
     --uploadSource --enableLocalMocks --headTestRunId <headTestRunId> --json
   ```

   `--json` prints `{ swarmRunId, commitSha, deploymentId, message? }` on stdout (logs go to
   stderr). Record `swarmRunId`; it is `null` when the launch was skipped, in which case record
   `message` as the reason (e.g. the daily launch cap). Do not wait for the swarm to finish.

## Flags that a CLI version rejects

The commands above match the CLI that created this workspace. If one is still rejected, read
`meticulous <command> --help` and adapt, recording what you changed in the backtest record.
Never add `--apiToken`.

## Failures

- Install or build fails at an old commit: read the error, try one obvious, local-only fix
  (e.g. the Node version the commit's `.nvmrc` pins, or `--legacy-peer-deps`), never by editing
  tracked files. If it still fails, record the error and stop — do not burn time.
- Upload or trigger fails transiently (network, 5xx): retry once after 15 s.
- Always leave the record file accurate: every id you obtained, every error in `errors`.

Stop any container you started. Leave the worktrees: the main agent removes them all at the
end (another backtester may share one).

## Report

One short paragraph: PR number, the four ids (base/head deployment, base/head test run) and
the swarm run id, build times, and any errors or caveats (e.g. "base needed Node 18").
