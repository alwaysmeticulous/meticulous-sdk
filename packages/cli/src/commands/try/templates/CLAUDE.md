# Meticulous Try

## What this is

The user wants to see, on their own code, what [Meticulous](https://www.meticulous.ai) would
have caught. You will build their app, record real sessions of it, then **backtest** Meticulous
against several pull requests that were already merged: for each PR, build the code before and
after it, replay the recorded sessions against both (visual + network diffs), and run **Agent
swarm** (AI agents that explore the PR's change and test it) on the result. Finally you report
what Meticulous found — ideally a real bug that shipped and was later reverted or fixed.

The user has only a Meticulous login. The CLI already created an empty trial project for them,
and `METICULOUS_API_TOKEN` in your environment is scoped to it: every `meticulous …` command you
run (and every subagent runs) reads and writes that project. **Never print, echo or paste the
token** (or `recordingToken`), never pass `--apiToken`, and never write either into a file.

Speed matters: the user is watching. Prefer the fastest path that produces real results,
parallelise independent work, and do not ask questions you can answer from the repo.

## Context

`try-context.json` (this workspace) holds:

- `projectRoot` — the user's repository (added with `--add-dir`). Your cwd is the workspace
  `<projectRoot>/.meticulous-try/`, which is gitignored.
- `organization` / `project` / `projectUrl` — the trial project. Link results under `projectUrl`.
- `packageManager`, `isMonorepo`, `selectedApp` (null means pick the app yourself from
  `discoveredApps`), `frameworkDetection` — CLI heuristics; verify them.
- `prCount` — how many PRs to backtest.
- `paths` — absolute paths of the build recipe, candidate PRs, sessions, builds cache, worktrees,
  backtest records, `recordingBugs` (one file per app bug you notice while recording),
  `replayFix` (the phase 3 fix, once saved) and `authState` (the login saved by
  `meticulous try login`, once it exists).

## Hard rules

- **Never modify the user's repository**: no edits to tracked files, no commits, pushes, branch
  switches, stashes, resets or PRs. Everything you create goes under `.meticulous-try/`. Build
  in a worktree (`meticulous try worktree`), never in `projectRoot` itself. The one commit you
  may make is the replay fix (phase 3), and only through `meticulous try replay-fix save`, which
  commits on a try worktree's detached HEAD so no branch moves.
- **If the app already ships Meticulous, disable it in every build you make.** Look for a
  `snippet.meticulous.ai` script tag, `data-recording-token`, `@alwaysmeticulous/recorder-loader`
  / `tryLoadAndStartRecorder`, or `@alwaysmeticulous/recorder-plugin`. The trial must start from
  a clean slate: the existing recorder would send sessions to the user's real Meticulous project
  and clash with the trial's own recorder. Disabling it is part of the build recipe (see phase 1).
  Mention it in the report so the user knows why.
- Run every browser you start headless (`--headless` on `meticulous crawl` and
  `meticulous record session`) so nothing opens on the user's screen. The one exception is
  `meticulous try login`, whose visible browser is for the user to log in.
- Never send secrets to Meticulous. Recipes store env var **names**, never values.
- Only ask the user when truly blocked: secrets or env values the app cannot start without,
  or a login. Ask once, precisely, with what you tried.
- **If the app (or the routes the candidate PRs touch) needs a login**, follow
  `.claude/skills/try-app-login/SKILL.md` before recording: it picks the mechanism (usually
  `meticulous try login`, which opens a browser for the user to log in and saves the session
  for every crawl and recorder) and how to pause for the user. Only ever use a test account.
  Never print, echo or summarise captured cookies, tokens or passwords.
- Clean up: stop every dev server, container and recording browser you start, and run
  `meticulous try cleanup --keepWorkspace` when the backtests are done. Plain `cleanup`
  (without `--keepWorkspace`) deletes this whole workspace and is for the user, not you.

## The five phases

Follow the skill for each phase; they hold the exact commands.

| Phase              | Skill                                         | Output                                                                                                          |
| ------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Build & serve   | `.claude/skills/try-build-and-serve/SKILL.md` | app running at `http://localhost:<port>` rendering real content; recipe saved with `meticulous try recipe save` |
| 2. Record coverage | `.claude/skills/try-record-coverage/SKILL.md` | 15–30 ingested sessions covering the main routes; ids in `sessions.json`                                        |
| 3. Check replays   | `.claude/skills/try-verify-replay/SKILL.md`   | the sessions replay cleanly (no diffs replaying the same build twice); any code change saved as the replay fix  |
| 4. Backtest PRs    | `.claude/skills/try-backtest-prs/SKILL.md`    | one `pr-backtester` subagent per PR, **all launched in one message**; records in `backtests/`                   |
| 5. Report          | `.claude/skills/try-report-results/SKILL.md`  | early findings once the first PRs finish, then a concise per-PR summary, most compelling first                  |

Overlap phases where it is safe: start `meticulous try candidate-prs` (pure git, instant) during
phase 1 so you know which commits matter, and while phase 2's sessions ingest, read the candidate
PRs' diffs to sanity-check the picks.

Post a one-line status update to the user at the start and end of each phase (e.g. "Phase 1 done:
Vite SPA builds in 40s, serves on :4173 against the public staging API").

## Subagents (`.claude/agents/`)

- `pr-backtester` — backtests exactly one PR end to end (one worktree for base then head,
  builds in shared build slots, upload, base run, head run, Agent swarm) and writes
  `backtests/pr-<n>.json`. Launch one per PR in parallel, with its rank.
- `session-recorder` — records a handful of named flows over its own CDP port. Launch 2–3 in
  parallel in phase 2 to fill gaps the crawler missed.

## Helper commands (`meticulous try <sub>`, add `--json` for machine-readable output)

| Command                                                                                                     | What it does                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `candidate-prs [--limit N] [--since 90d]`                                                                   | Ranks recently merged PRs from local git history (merge and squash commits): BASE = first parent, HEAD = merge/squash commit. Scores UI files touched, size, later reverts / follow-up fixes, refactors. Saves `candidate-prs.json`. |
| `worktree --sha <sha> --name <name>`                                                                        | Detached worktree under `worktrees/<name>`; switches an existing one in place, keeping its install. `--json` adds `installInputsChanged` (`[]` = skip the install). `--clean <dir>` deletes old build output. `--remove <name>`.     |
| `slot acquire --owner <id> --rank N` / `release`                                                            | Shared build slots: hold one around every install and build so they never all run at once. Re-run `acquire` until `"acquired": true`; always `release`.                                                                              |
| `login --url <url>`                                                                                         | Opens a browser at `url` for the user to log in; when they close it, saves its cookies and local storage to `auth/storage-state.json` for `--storageState`. Prints key names only. Exit code 1 if nothing was captured.              |
| `cleanup --keepWorkspace`                                                                                   | Removes every try worktree and the saved login state, keeping the rest of the workspace.                                                                                                                                             |
| `recipe save --file <json>` / `recipe show`                                                                 | Validates and persists the build recipe / prints it.                                                                                                                                                                                 |
| `wait-for-sessions --min N --timeoutSeconds S`                                                              | Polls until the project has ≥ N ingested sessions; saves their ids to `sessions.json`. Exit code 1 on timeout.                                                                                                                       |
| `replay-fix save --worktree <name> --paths <files…> --message <why>` / `replay-fix apply --worktree <name>` | Saves the phase 3 code change as one commit (detached, no branch moves) / applies it uncommitted to a backtest worktree, reporting conflicts.                                                                                        |
| `results [--waitSeconds S] [--waitFor N]`                                                                   | Joins backtest records with the project's test runs and Agent swarm runs into a per-PR summary, most compelling first. `--waitFor N` returns once N PRs have finished.                                                               |

The general Meticulous CLI is documented by `meticulous <command> --help` and
`meticulous schema`. If a documented flag is rejected, check `--help` for that command and adapt
rather than giving up — but never fall back to `--apiToken`.

## The Meticulous MCP server

`.mcp.json` configures the hosted Meticulous MCP server. It is optional — the CLI covers
everything here and is already authenticated. Only use it if it is already authenticated;
never ask the user to authenticate it.

## Finishing

The final message is the phase 5 report. Near the end, tell the user they can set Meticulous up
on every PR with `npx @alwaysmeticulous/cli onboard`, and that their trial project stays at
`projectUrl`. The very last section is **Bugs found**: every likely bug from the backtests and
from recording, each with a direct link (see the report skill).
