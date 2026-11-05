---
name: try-report-results
description: Phase 4 of `meticulous try` — wait for the backtest runs, dig into the strongest findings, and give the user a concise per-PR report that leads with what Meticulous caught.
---

# Phase 4 — Report

Goal: a short report the user can act on, leading with the most compelling evidence that
Meticulous would have caught something real. Accuracy beats hype: never call a diff a bug
without having looked at it.

## 1. Wait for the runs

```bash
meticulous try results --json --waitSeconds 2400
```

It polls until every head test run and Agent swarm run has finished (or the wait ends), and
returns one row per PR sorted most compelling first: failing Agent swarm cases, regressions,
diff counts, and the PR's history signals (later revert / follow-up fixes). While waiting, tell
the user what is running and roughly how long it takes (test runs: minutes; Agent swarm: up to
~30 minutes).

If some runs are still pending when the wait ends, report what has finished and list the
pending ones with their links.

## 2. Look at the top findings yourself

For the top 3–4 PRs with findings:

- Agent swarm: `meticulous agent agent-swarm-run --swarmRunId <id> --json`, then
  `meticulous agent agent-swarm-run-case --swarmRunId <id> --caseIndex <i> --json` for each
  failing case — read what the agent did, what broke, and the evidence.
- Replay diffs: `meticulous agent test-run-diffs --testRunId <headTestRunId> --json`, then
  `meticulous agent image-files` for the most significant diffs if you need to see them.
- Compare against the PR: `git show --stat <headSha>` and the diff of the files involved. A
  diff the PR clearly intended (it changed that copy, that layout) is an **expected change**,
  not a bug — say "Meticulous showed the intended change on N screens" instead.
- For PRs that were later reverted or fixed: read the revert/fix commit
  (`git show <sha>`). If what Meticulous flagged matches what the fix changed, that is the
  headline — "Meticulous would have caught the bug fixed in <sha> before it merged".

Classify each finding as **likely bug**, **unintended change worth checking**, **expected
change**, or **noise** (flake, animation, timestamp). Keep noise out of the headline.

## 3. Write the report

Keep it under ~40 lines. Structure:

1. **Headline** — one or two sentences with the strongest real finding, e.g. "On #412 (later
   reverted in a1b2c3), Agent swarm found the checkout button no longer submits when a coupon
   is applied — exactly what the revert fixed."
2. **Per PR**, most compelling first, 2–4 lines each:
   `#<n> <title>` — verdict; the evidence in one line; links to the head test run and the Agent
   swarm run (from `results`).
3. **What was covered** — sessions recorded and the main areas, and anything not covered
   (login-gated pages, routes that errored) that limited the results.
4. **Next step** — "To get this on every PR, run `meticulous onboard` in this repo: it installs
   the recorder and the CI job and opens a PR." Mention the trial project link (`projectUrl`).

If nothing compelling was found, say so plainly, show what Meticulous did verify (screens
compared, flows the agents exercised and passed), and suggest the most promising gap (e.g.
recording the flows behind login).
