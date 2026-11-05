---
name: try-backtest-prs
description: Phase 3 of `meticulous try` — pick the recently merged PRs most likely to show Meticulous's value and backtest all of them in parallel, one pr-backtester subagent per PR.
---

# Phase 3 — Backtest PRs, fast

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

## 2. Check the machine can take it

`nproc` / `sysctl -n hw.ncpu` and `sysctl -n hw.memsize` / `free -g`, and the recipe's build
time. Each backtester runs two installs and two builds. Launch all PRs at once on machines with
≥ 8 cores and ≥ 16 GB RAM and builds under ~3 minutes; otherwise launch in two waves (still
each wave in a single message). Container recipes: at most 4 at once. The trial project accepts at most 20 test
runs per hour (two per PR, fewer when PRs share commits), so never go above 10 PRs or retry a
whole PR more than once.

## 3. Launch one `pr-backtester` per PR — in a single message

Send **one message with one Task call per PR** (subagent type `pr-backtester`) so they run in
parallel. Give each, in its prompt:

- PR number, title, `baseSha`, `headSha` (full shas, from candidate-prs.json)
- why it was picked (the reasons), so it can sanity-check the build
- the workspace path and `projectRoot`
- anything from phase 1/2 that is not in the recipe (env setup, gotchas)

Backtesters coordinate builds of shared commits through `builds/<sha>.json` (when one PR's
head is another's base) and each writes `backtests/pr-<n>.json` as it goes.

## 4. While they run

Do not poll each subagent. When all have reported, check `meticulous try results --json`:
every PR should have a head test run and an Agent swarm run (pending is fine). For any
backtester that failed, read its error: retry once yourself if it is a transient upload or
network failure, or drop the PR and say why if its old commit simply does not build.

Then free disk and processes: `meticulous try cleanup` (removes every worktree), and stop any
leftover containers you started (`docker ps --filter name=try-`).

Done when: every picked PR has a record in `backtests/` with ids or an explained error.
