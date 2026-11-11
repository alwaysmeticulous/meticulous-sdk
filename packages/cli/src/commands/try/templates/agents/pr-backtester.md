---
name: pr-backtester
description: Backtests ONE already-merged PR with Meticulous end to end — builds its base and then head commit in leased warm worktrees from the saved recipe, snapshots each build output, uploads both, triggers the base and head test runs and an Agent swarm run, and records every id. Launch one per PR, all in parallel, during `meticulous try` phase 4.
tools: Bash, Read, Write, Edit
model: sonnet
---

You backtest exactly one PR: `prNumber`, `rank` (1 = most promising), `baseSha` (BASE, the
default branch just before it landed) and `headSha` (HEAD, the commit that landed it), given in
your prompt. Other
backtesters are running at the same time on other PRs. `METICULOUS_API_TOKEN` is set for the
trial project — never print it or pass `--apiToken`. If your prompt says to prefix `meticulous`
commands with `. <workspace>/agent-env.sh && `, do so for every one. Never modify the user's checkout: you
work only in worktrees under `.meticulous-try/worktrees/`.

Be fast and light: never wait on a test run or Agent swarm to finish, never rediscover how to
build (the recipe says how), and never install or build outside a build slot.

## Setup

```bash
cd <workspace>                     # .meticulous-try
meticulous try recipe show --json  # kind, installCmd, buildCmd, outputDir, containerPort, cacheEnv, notes
cat sessions.json                  # sessionIds: replay exactly these on base and head
```

`SESSION_IDS` below is `sessionIds` joined with commas. Short shas below are the first 12
characters.

If the recipe has `cacheEnv` entries, `export` each entry of the recipe output's
`cacheEnvResolved` (absolute, already-created paths) in every shell that runs `installCmd` or
`buildCmd`, so all builds share one content-hash-keyed cache.

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

## Build slots lease warm worktrees

The machine is shared with the other backtesters and with the user, so every install and every
build runs inside one of a few build slots. Each slot leases the worktree `slot-<n>`, whose
`node_modules` and build caches carry over from whoever built in it last — so most of your
builds are warm, incremental ones.

```bash
meticulous try slot acquire --owner pr-<n> --rank <rank> --sha <sha> --json   # repeat until "acquired": true
<installCmd and/or buildCmd, inside the slot's worktree>
meticulous try slot release --owner pr-<n> --json                             # always, also after a failure
```

Always pass `--sha` (the commit you are about to build): a free slot whose worktree is closest
to it in history is leased, which keeps the checkout switch and the rebuild small. The acquire
result's `worktree` field gives the leased worktree's `name`, `path` and current `sha`.
`acquire` waits up to 9 minutes; on `"acquired": false` run it again straight away (you keep
your place in the queue). Hold a slot only while installing, building, or (head only, below)
launching the Agent swarm — **never while waiting on another backtester** (their build may be
queued for the very slot you are holding, which deadlocks the pool). Run an install or build
that may take more than a few minutes with Bash `run_in_background` and release the slot when
it exits. Only ever build inside a worktree your slot currently leases: once you release, the
worktree belongs to the next holder.

## Shared builds

Another PR's head may be your base. Before building commit `<sha>`:

- If `builds/<sha>.json` exists with a `deploymentId`, reuse it — skip building that commit.
- Otherwise claim it: `mkdir builds/<sha>.lock`. If that fails, another backtester is building
  it: do your other commit first, then poll `builds/<sha>.json` every 20 s (up to 30 min) and
  reuse its `deploymentId`; if it records `"error"`, fail the same way.
- Poll with one Bash call that loops and exits by itself — a bare `sleep` followed by another
  command is refused, and you have no Monitor tool. Give the call a 600000 ms timeout (the
  maximum) so it stays in the foreground:

  ```bash
  for i in $(seq 1 28); do [ -f builds/<sha>.json ] && break; sleep 20; done; cat builds/<sha>.json
  ```

  Re-run it until the file appears or 30 minutes have passed. Wait for a field (e.g. `testRunId`)
  the same way, testing it with `grep -q`.

- Only ever touch your own claims: remove a `builds/<sha>.lock` you created, never a glob of
  them, and never stop processes by name (`pkill npm`, `pkill -f …`) — every other backtester
  runs the same commands. To stop something you started, kill its pid.
- After uploading, write `builds/<sha>.json`:
  `{ "sha": "<full>", "deploymentId": "<id>" }` (or `{ "sha": "…", "error": "…" }`). Once you
  trigger a test run at that commit (base or head), add its id as `"testRunId"`; any run at a
  commit can serve as another PR's base.

## 1. Building one commit in a leased worktree

With a slot held, switch its worktree to the commit:

```bash
meticulous try worktree --name <worktree.name> --sha <sha> --clean <outputDir> --json
# container recipes have no outputDir: leave out --clean
```

It prints `{ path, previousSha, installInputsChanged, seededFrom }`. `--clean` deletes any
stale build output a previous holder left behind, so it is never uploaded by mistake.

Then, every time right after checking out a commit (switching discards it), apply the replay fix
from phase 3:

```bash
meticulous try replay-fix apply --worktree <worktree.name> --json
```

- `"applied": true` — good; the fix is in the files, uncommitted.
- `"reason": "no-fix"` — phase 3 needed no fix; carry on.
- `"reason": "conflict"` — the fix does not apply cleanly at this commit. Read it
  (`git show <commitSha>`) and make the same change by hand in the worktree; if that is not
  possible, record it in `errors` and carry on without it.

Base and head must both get the fix, so it never shows up as a diff.

Run `installCmd` (in the slot, cwd = the worktree root) when `installInputsChanged` is `null`
or lists files (a lockfile, `.npmrc`, `.nvmrc`, patches, …), or the replay fix changes one of
those; otherwise skip the install. A brand-new worktree gets its `node_modules` copied from an
existing checkout automatically when that checkout's install fits this commit (`seededFrom`
says which; `installInputsChanged` is then `[]`, so the install is skipped). For npm prefer
`npm ci --prefer-offline`.

Then build with the recipe's `buildCmd`, exactly. In a monorepo it is scoped to the selected
app's package — never widen it to a workspace-wide build or rebuild packages the app does not
depend on; if the scoped command fails at an old commit, check the `notes` before improvising.

## 2. Base: build → snapshot → release → upload → base run

Skip this section if BASE is already built or another backtester is building it (see Shared
builds): do the head first.

1. Acquire a slot with `--sha <BASE>`, switch its worktree to BASE, apply the replay fix,
   install if needed, then build (container: `export TRY_IMAGE_TAG=<dockerPrefix>:<base12>`
   first, `dockerPrefix` from `try-context.json`).
2. Move the build output out of the worktree, then release the slot — the upload reads the
   snapshot, so the worktree is free for the next build:

   ```bash
   meticulous try snapshot-build --worktree <worktree.name> --sha <BASE> --json  # prints { path }
   meticulous try slot release --owner pr-<n> --json
   ```

   (container: no snapshot — the image tag outlives the worktree; release right after the
   build.)

3. Upload, from the workspace:
   - static: `meticulous agent upload-build --appDirectory <snapshot path> --commitSha <BASE> --json`
   - container: `meticulous agent upload-build --localImageTag <dockerPrefix>:<base12> --containerPort <containerPort> --commitSha <BASE> --json`
     (add `--containerHealthCheckEndpoint <healthCheckPath>` when set)

   Record `deploymentId` as `baseDeploymentId` and in `builds/<BASE>.json`.

4. Trigger the base run without waiting, from the workspace:

   ```bash
   meticulous agent trigger-test-run --deploymentId <baseDep> --commitSha <BASE> \
     --sessionIds "$SESSION_IDS" --dontWaitForTestRunToComplete --json
   ```

   With no `--baseSha` / `--baseTestRunId` this is a baseline run: it replays the sessions with
   nothing to compare against and becomes the base for the head run. Record `testRunId` as
   `baseTestRunId`. If `builds/<BASE>.json` already has a `testRunId`, use that as
   `baseTestRunId` instead of triggering a second run (the trial project is limited to 200 test
   runs per hour).

## 3. Head: build → snapshot → upload → head run → Agent swarm → release

The Agent swarm launch reads the head's **source** from the worktree, so for the head keep the
slot while you upload, trigger and launch the swarm — those are quick. The one thing you must
never do while holding it is wait on another backtester (step 3).

1. Acquire a slot with `--sha <HEAD>`, switch its worktree to HEAD, apply the replay fix again,
   install only if needed (see above), then build (container tag `<dockerPrefix>:<head12>`).
2. Snapshot as for base (`meticulous try snapshot-build --worktree <worktree.name> --sha <HEAD> --json`)
   but do **not** release yet. Upload exactly as for base, with `--commitSha <HEAD>` and the
   snapshot path. Record `headDeploymentId`.
3. If `baseTestRunId` does not exist yet because another backtester is still producing the
   base, **release the slot now** — they may be queued for it — and poll `builds/<BASE>.json`
   every 20 s (see Shared builds) with no slot held. Once it is there, acquire a slot with
   `--sha <HEAD>` again, switch its worktree to HEAD and re-apply the replay fix (no install or
   build is needed: only the source matters from here on).
4. Head run, compared with the base run:

   ```bash
   meticulous agent trigger-test-run --deploymentId <headDep> --commitSha <HEAD> --baseSha <BASE> \
     --baseTestRunId <baseTestRunId> --sessionIds "$SESSION_IDS" \
     --dontWaitForTestRunToComplete --json
   ```

   Record `headTestRunId`. The CLI computes the BASE..HEAD diff from the repository's local
   history; pass `--gitDiffFile <path>` only if it says it cannot.

5. Agent swarm on the head, logging to `backtests/pr-<n>.agent-test.log`:

   ```bash
   meticulous ci agent-test --deploymentId <headDep> --commitSha <HEAD> \
     --repoDirectory <worktree.path> --baseSha <BASE> \
     --uploadSource --enableLocalMocks --headTestRunId <headTestRunId> --json
   ```

   `--json` prints `{ swarmRunId, commitSha, deploymentId, message? }` on stdout (logs go to
   stderr). Record `swarmRunId`; it is `null` when the launch was skipped, in which case record
   `message` as the reason (e.g. the daily launch cap). Do not wait for the swarm to finish,
   but do wait for this command to exit (it reads the worktree's source).

6. Release the slot. If the swarm launch is skipped or fails before reading the source, release
   as soon as you know.

## Flags that a CLI version rejects

The commands above match the CLI that created this workspace. If one is still rejected, read
`meticulous <command> --help` and adapt, recording what you changed in the backtest record.
Never add `--apiToken`.

## Failures

- Install or build fails at an old commit: release the slot, read the error, try one obvious, local-only fix
  (e.g. the Node version the commit's `.nvmrc` pins, or `--legacy-peer-deps`), never by editing
  tracked files. If it still fails, record the error and stop — do not burn time.
- Upload or trigger fails transiently (network, 5xx): retry once after 15 s.
- Trigger rejected with HTTP 429 (the project's test-run rate limit): release any slot you hold
  and retry every 2 minutes, for up to 30 minutes, then record it in `errors`.
- Always leave the record file accurate: every id you obtained, every error in `errors`.

Stop any container you started and release any build slot you still hold. Leave the worktrees
and snapshots: the main agent removes them all at the end.

## Report

One short paragraph: PR number, the four ids (base/head deployment, base/head test run) and
the swarm run id, build times and whether installs were skipped, whether the replay fix applied
cleanly on both commits, and any errors or caveats (e.g. "base needed Node 18").
