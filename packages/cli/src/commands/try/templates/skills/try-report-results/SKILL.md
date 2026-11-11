---
name: try-report-results
description: Phase 5 of `meticulous try` — post early findings as soon as the first backtests finish, then wait for the rest, dig into the strongest findings, and give the user a concise per-PR report that leads with what Meticulous caught.
---

# Phase 5 — Report

Goal: a short report the user can act on, leading with the most compelling evidence that
Meticulous would have caught something real. Accuracy beats hype: never call a diff a bug
without having looked at it.

## 1. Early findings — as soon as the first PRs finish

The user should not wait for every PR before seeing anything. The highest-ranked PRs get build
slots first, so their runs finish first:

```bash
meticulous try results --json --waitFor 2 --waitSeconds 2400
```

Run it with Bash `run_in_background` (it can outlast a foreground command). It returns as soon
as two PRs have finished. Look at those two the way step 3 describes, then post a short update
(under ~10 lines): what Meticulous found on them so far, each PR with a single `[run](<runUrl>)`
link, and that the other PRs are still running. Do not over-claim: this is a first look, not the report.

## 2. Wait for the rest

```bash
meticulous try results --json --waitSeconds 2400
```

Also in the background. It polls until every head test run and Agent swarm run has finished
(or the wait ends), and returns one row per PR sorted most compelling first: failing Agent
swarm cases, regressions, diff counts, and the PR's history signals (later revert / follow-up
fixes). While waiting, tell the user what is running and roughly how long it takes (test runs:
minutes; Agent swarm: up to ~30 minutes).

If some runs are still pending when the wait ends, report what has finished and list the
pending ones with their `runUrl`.

## 3. Look at the top findings yourself

For the top 3–4 PRs with findings:

- Agent swarm: `meticulous agent agent-swarm-run --swarmRunId <id> --json`, then
  `meticulous agent agent-swarm-run-case --swarmRunId <id> --caseIndex <i> --json` for each
  failing case — read what the agent did, what broke, and the evidence. Each failing case in
  `results` has a `url` that opens that case directly.
- Replay diffs: `meticulous agent test-run-diffs --testRunId <headTestRunId> --json`, then
  `meticulous agent image-files` for the most significant diffs if you need to see them. A
  single diff opens directly at `<runUrl>/replay-diff/<replayDiffId>`.
- Bugs noted while recording: read every file in `recording-bugs/`. Re-check any marked
  "unsure" if you can do so quickly; keep the ones that still look like real bugs in the app.
- Compare against the PR: `git show --stat <headSha>` and the diff of the files involved. A
  diff the PR clearly intended (it changed that copy, that layout) is an **expected change**,
  not a bug — say "Meticulous showed the intended change on N screens" instead.
- For PRs that were later reverted or fixed: read the revert/fix commit
  (`git show <sha>`). If what Meticulous flagged matches what the fix changed, that is the
  headline — "Meticulous would have caught the bug fixed in <sha> before it merged".

Classify each finding as **likely bug**, **unintended change worth checking**, **expected
change**, or **noise** (flake, animation, timestamp). Keep noise out of the headline.

## 4. Write the report

Keep it under ~45 lines. Structure:

1. **Headline** — one or two sentences with the strongest real finding, e.g. "On #412 (later
   reverted in a1b2c3), Agent swarm found the checkout button no longer submits when a coupon
   is applied — exactly what the revert fixed."
2. **Per PR**, most compelling first, 2–4 lines each:
   `#<n> <title>` — verdict; the evidence in one line; one link, `[run](<runUrl>)` (from
   `results`). Its page holds both the replay diffs and the Agent swarm tab, so do not add
   separate head-run or Agent swarm links.
3. **What was covered** — sessions recorded and the main areas, and anything not covered
   (login-gated pages, routes that errored) that limited the results. If phase 3 needed a
   replay fix, say in one line what it changes and why, since every backtest build included it.
4. **Next step** — "To get this on every PR, run `npx @alwaysmeticulous/cli onboard` in this repo: it installs
   the recorder and the CI job and opens a PR." Mention the trial project link (`projectUrl`).
5. **Bugs found** — always the very last section, so it is what the user reads last. One line
   per bug classified **likely bug**, each with a direct link to the evidence:
   - from Agent swarm: the failing case's `url` (it opens that case);
   - from a replay diff: `<runUrl>/replay-diff/<replayDiffId>`;
   - from recording (`recording-bugs/`): say it was found while recording, give the route and
     what breaks, and link the session (`<projectUrl>/sessions/<sessionId>`) when there is one.

   Format: `- <what breaks, in plain words> (#<n> <title>, or "found while recording") — [link](<url>)`.
   If there are none, say "No bugs found" plainly; never pad this list with expected changes or
   noise.

After the report, run `meticulous try cleanup --keepWorkspace` (removes every worktree, the
build-output snapshots, the shared build cache and the saved login). Not earlier: a finding may
need a rebuild or another recording before you can report it.

If nothing compelling was found, say so plainly, show what Meticulous did verify (screens
compared, flows the agents exercised and passed), and suggest the most promising gap (e.g.
recording the flows behind login).
