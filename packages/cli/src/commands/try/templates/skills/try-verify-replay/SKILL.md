---
name: try-verify-replay
description: Phase 3 of `meticulous try` — before backtesting, replay the recorded sessions against a build of the app and check they replay cleanly; if they do not, change the build or the app until they do, and save any code change as the replay fix every backtest applies to its base and head.
---

# Phase 3 — Check that replays work

Goal: proof that the recorded sessions replay correctly against a build of the app, so the
backtests in phase 4 measure each PR rather than replay problems. Budget: ~15 minutes and at
most 3 fix attempts.

A replay **works** when it runs to the end, its screenshots show the same real UI the session
recorded (not a blank page, an error overlay, an endless spinner or a login wall), the app's own
server logs no errors while it runs, and replaying the same build twice shows **no diffs**.

"No diffs" alone proves nothing: a page that crashes or bounces to a login identically on both
sides also shows no diffs, and every backtest would then report 0 diffs too. Always look at
screenshots and server logs as well.

## 1. Quick local check (uses no test runs)

The app from phase 1 is still serving. Pick 3 sessions from `sessions.json` covering different
areas (one from the crawler, two from the recorders), at least one of them a signed-in session
recorded **10 or more minutes ago** (backtests replay sessions hours after recording, and a
short-lived auth token that was still valid a minute after recording has expired by then), and
replay each against it:

```bash
meticulous simulate --sessionId <id> --appUrl http://localhost:<port> --headless --screenshot
```

It prints where it saved the replay. Look at the final screenshot (Read tool) and the log for
errors, requests that were not stubbed, and replays that ended early. For a server-rendered app,
also read the app server's own output while the replay runs (`docker logs` for a container):
auth errors, redirect or token-refresh loops and 5xx responses there mean the pages the replay
shows are not what the session recorded. Fix problems here first (step 3): it is much faster
than the cloud check.

## 2. Cloud check — the same path the backtests use

1. Build HEAD from the recipe, inside a build slot and its leased worktree (see the
   `pr-backtester` agent for the full slot/worktree/snapshot flow):

   ```bash
   meticulous try slot acquire --owner replay-check --sha HEAD --json   # leases worktree slot-<n>
   meticulous try worktree --name <worktree.name> --sha HEAD --clean <outputDir> --json
   meticulous try replay-fix apply --worktree <worktree.name> --json   # no-op until a fix exists
   ```

   Install (only if the worktree output says so), build, snapshot
   (`meticulous try snapshot-build`), release the slot, and upload from the snapshot exactly as
   `pr-backtester` does. The worktree you warm up here is the one the backtesters reuse in
   phase 4.

2. Trigger a baseline run, then a second run of the **same deployment** compared against it.
   A run whose base is its own commit, with pinned sessions and no diff, runs head-only and
   compares nothing, so give run B a diff that changes no app code: a blank line appended to a
   tracked Markdown file (or any tracked file the app does not build, if there is none), taken
   in the worktree and undone straight away.

   ```bash
   meticulous agent trigger-test-run --deploymentId <dep> --commitSha <HEAD> \
     --sessionIds "$SESSION_IDS" --dontWaitForTestRunToComplete --json        # run A
   F=$(git -C <worktree.path> ls-files '*.md' | head -1)
   echo >> "<worktree.path>/$F" && git -C <worktree.path> diff -- "$F" > replay-check.diff \
     && git -C <worktree.path> checkout -- "$F"
   meticulous agent trigger-test-run --deploymentId <dep> --commitSha <HEAD> --baseSha <HEAD> \
     --baseTestRunId <runA> --gitDiffFile replay-check.diff --sessionIds "$SESSION_IDS" \
     --dontWaitForTestRunToComplete --json                                    # run B
   ```

3. If phase 1 did not start `meticulous try prewarm --json`, start it in the background now
   (Bash `run_in_background`) while the runs execute in the cloud, so phase 4 does not pay for
   checkouts one by one. It creates missing slot worktrees in parallel and is safe to re-run.

4. When run B has finished (`meticulous agent test-run-diffs --testRunId <runB> --counts --json`;
   check `--help` for how it reports a run that is still processing), it should have replayed
   every session (`numReplays`) with **no diffs**: the code is identical, so every diff is a
   replay problem. Look at each one (`meticulous agent image-files`) to see what differs.
   `numReplays: 0` means nothing was compared — not a pass.

5. For a container recipe, read run A's server logs — the only place a server-side failure
   shows:

   ```bash
   meticulous download test-run --testRunId <runA> --scope app-container-logs
   ```

   Auth errors ("infinite redirect loop", invalid or expired token), unhandled exceptions, 5xx
   responses or failed database or API connections mean replays are not rendering real pages,
   even with no diffs: fix them (step 3) before phase 4.

Each cloud check takes two of the trial project's 200 test runs per hour and phase 4 needs about
two per PR, so use at most two cloud checks (4 runs) here; iterate locally in between.

When the last cloud check passes, write `builds/<HEAD>.json`:
`{ "sha": "<HEAD>", "deploymentId": "<dep>", "testRunId": "<runA>" }`, so a backtest whose base
or head is HEAD reuses this build instead of building it again.

## 3. If replays do not work: fix and try again

Typical causes, and where the fix goes:

- **Auth that expires** (the server rejects the recorded session token and redirects or loops;
  see the `try-app-login` skill): make the trial build accept the recorded token, gated on an env
  var only the trial's build or container sets, and save it as the replay fix below.
- **Build or environment** (a different env var than when recording, a service worker caching
  old assets, an existing Meticulous snippet still loading): fix the recipe and save it again
  with `meticulous try recipe save`. Every backtest uses the recipe, so nothing else is needed.
- **The app itself** (content that changes on every load: autoplaying carousels or animations
  that ignore reduced motion, random ids or ordering in what is rendered, live clocks;
  a third-party script or websocket that fails during replay and shows an error): prefer a
  switch the app already has (a test or CI mode, an env flag). Otherwise make the smallest code
  change that makes the replay deterministic, in the worktree you built in (re-acquire the slot
  if you released it, so no backtester switches it under you), and save it:

  ```bash
  meticulous try replay-fix save --worktree <worktree.name> --paths <changed files> \
    --message "<what it changes and why replays need it>" --json
  ```

  This commits the change on the worktree's detached HEAD (no branch in the user's repository
  moves) and records it in `replay-fix.json`. Every backtester cherry-picks it into both its base
  and its head, so the fix is the same on both sides and does not show up as a diff. Saving again
  replaces the fix with one combined commit. Never change product behaviour beyond what replays
  need, and never put secrets in the fix.

After each fix, repeat step 1, then step 2. If replays still do not work after 3 attempts, move on
to phase 4 anyway, and tell the user what does not replay and why: it limits what the backtests
can show.

Stop the local app server when you are done with this phase.

Done when: run B replayed every session with no diffs, the screenshots show real pages and the
server logs are clean, or you have used up the attempts. Tell the user in one or two lines how many sessions replay cleanly, and what you changed
to get there (recipe change, replay fix and its files, or nothing).
