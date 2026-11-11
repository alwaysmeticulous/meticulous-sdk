---
name: try-backtest-prs
description: Phase 4 of `meticulous try` — pick the recently merged PRs most likely to show Meticulous's value and backtest all of them in parallel, one pr-backtester subagent per PR.
---

# Phase 4 — Backtest PRs, fast

Goal: for each of `prCount` merged PRs, a base test run, a head test run compared against it,
and an Agent swarm run on the head — all triggered, none waited on. Wall-clock time is what
the user feels: everything here runs in parallel.

## 1. Pick the PRs (2 minutes)

```bash
meticulous try candidate-prs --json --limit 20
```

Candidates are ranked by: a later revert or fix-worded commits to the same UI files within 14
days (strongest evidence a bug shipped), meaningful UI size, broad refactors/upgrades, recency.
Take the top `prCount`, adjusting by judgement:

- Prefer PRs whose changed UI is covered by the recorded sessions (compare `frontendFiles` with
  the routes recorded in phase 2). A PR touching a page nobody visited shows nothing.
- Keep every reverted / followed-by-fix PR unless its UI area is entirely uncovered.
- Drop PRs that only touch tests, docs, tooling or server code the reasons missed, and PRs
  whose base commit predates a build-system change that the recipe would not handle (e.g. a
  different package manager or framework major version — check `git show <base>:package.json`).
- Mix in at least one ordinary feature PR so the report also shows a typical PR's result.

Post the list to the user in one line per PR (`#123 <title> — <main reason>`) and carry on
without waiting for approval.

## 2. The machine is shared

Every install and build runs in a shared build slot (`meticulous try slot`; `buildSlots` in
try-context.json, about one per 4 cores), so launching every PR at once never runs more installs
or builds than the machine can take. Each slot leases a warm worktree (`slot-<n>`) whose
`node_modules` and build caches carry over between backtesters, so there are only as many
checkouts and installs as slots, not one per PR — the backtesters build in whichever worktree
their slot hands them. The most promising PRs get slots first. Each PR costs two test runs (fewer
when PRs share commits) of the trial project's 200 per hour; still, never go above 10 PRs or
retry a whole PR more than once.

If neither phase 1 nor phase 3 ran it, start `meticulous try prewarm --json` in the background now (Bash
`run_in_background`, do not wait for it): it creates every missing slot worktree in parallel so
the backtesters find them warm. It is safe alongside them — it skips held slots.

## 3. Launch one `pr-backtester` per PR — in a single message

Send **one message with one Task call per PR** (subagent type `pr-backtester`) so they run in
parallel, in the background when your Agent tool supports it (so you can report early, below).
Give each, in its prompt:

- PR number, title, `baseSha`, `headSha` (full shas, from candidate-prs.json)
- `rank`: its position in your list, 1 = most promising (it orders the build-slot queue)
- why it was picked (the reasons), so it can sanity-check the build
- the workspace path and `projectRoot`
- anything from phases 1–3 that is not in the recipe (env setup, gotchas), and whether there
  is a replay fix (`replay-fix.json`) and what it changes

Backtesters coordinate builds of shared commits through `builds/<sha>.json` (when one PR's
head is another's base) and each writes `backtests/pr-<n>.json` as it goes.

## 4. While they run

Do not poll each subagent. If they run in the background, go straight to phase 5's early
findings step while they work. When all have reported, check `meticulous try results --json`:
every PR should have a head test run and an Agent swarm run (pending is fine). For any
backtester that failed, read its error: retry once yourself if it is a transient upload or
network failure, or drop the PR and say why if its old commit simply does not build.

Then stop any leftover containers you started (`docker ps --filter name=<dockerPrefix>-`; only ever stop containers with this trial's
`dockerPrefix` — other trials may be running).

Done when: every picked PR has a record in `backtests/` with ids or an explained error.
