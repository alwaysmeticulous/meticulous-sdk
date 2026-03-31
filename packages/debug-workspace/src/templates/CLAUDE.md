# Meticulous Debug Workspace

## What This Is

You are in a debugging workspace for the Meticulous automated UI testing platform.
You are investigating a replay issue (flaky behavior, unexpected diffs, or replay failures).

`debug-data/context.json` has been automatically loaded into your context. It contains all IDs, paths,
metadata, and what data is available in this workspace. You do not need to read it again.

## How Meticulous Works

Meticulous records user sessions by injecting a JavaScript recorder snippet into your
application. These sessions capture user activity and network requests. When you make
a commit, Meticulous triggers a test run that replays selected sessions against the new code,
taking screenshots at key moments. If there is a base test run to compare against, screenshot
diffs are computed and surfaced to the developer.

- A **replay** is a single session being replayed against a version of your app.
- A **test run** is a collection of replays triggered by a commit.
- A **replay diff** compares a head replay (new code) against a base replay (old code) and
  contains the screenshot diff results.
- A **session** is the original user recording that gets replayed.

## Workspace Layout

The workspace root contains the debug workspace files. All downloaded debug data lives under
the `debug-data/` subdirectory.

- **`.claude/`** -- Configuration for this debugging workspace (hooks, skills, agents).
- **`debug-data/context.json`** -- Loaded automatically into context by the SessionStart hook;
  you do not need to read it again.
- **`debug-data/`** -- All downloaded replay data, session recordings, diffs, and
  pre-computed analysis artifacts.
- **`project-repo/`** -- (Optional) Your codebase checked out at the relevant commit.
  Only present if the command was run from within a git repository.

## debug-data/ Contents

Data falls into three categories: per-replay files (always present), diff files (only when
comparing replays), and other data.

### Per-Replay Files (always available)

Replay data is organized into `head/`, `base/`, and `other/` subdirectories under
`debug-data/replays/`. All files are searchable and can be found via glob/search.

Each replay directory (`debug-data/replays/{head,base,other}/<replayId>/`) contains:

- `logs.deterministic.txt` -- Deterministic logs with non-deterministic data stripped. Best for
  diffing between replays. Can be very large (check `fileMetadata` in `context.json` for sizes).
- `logs.deterministic.filtered.txt` -- **Start here for single-replay investigation.**
  Noise-stripped version of the deterministic logs: tunnel URLs, S3 tokens, PostHog payloads,
  build hashes, and other non-deterministic patterns are replaced with placeholders. Prefer this
  over the raw version unless you need unmodified output.
- `logs.concise.txt` -- Full logs with both virtual and real timestamps, and trace IDs.
- `timeline.json` -- Detailed timeline of all replay events (user interactions, network requests,
  DOM mutations, etc.). Can be 1-2MB; prefer `debug-data/timeline-summaries/` for a compact overview.
- `timeline-stats.json` -- Aggregated statistics about timeline events.
- `metadata.json` -- Replay configuration, parameters, and environment info.
- `launchBrowserAndReplayParams.json` -- The exact parameters used to launch the replay.
- `stackTraces.json` -- JavaScript stack traces captured during replay (if any errors occurred).
- `accuracyData.json` -- Replay accuracy assessment comparing to expected behavior.
- `snapshotted-assets/` -- Static assets (JS/CSS) that were captured and used during replay.
  **Only present if `snapshotAssets` was enabled** -- check `launchBrowserAndReplayParams.json`
  for the `snapshotAssets` field before assuming this directory exists.

Note: `screenshots/` are not copied into the workspace (they are large binary PNGs). Reference
screenshot paths via `screenshotMap` in `context.json` instead; the actual files are in the
replay cache at `~/.meticulous/replays/<replayId>/screenshots/`.

Per-replay generated summaries:

- `debug-data/timeline-summaries/<role>-<replayId>.txt` -- Compact summary of each replay's
  timeline: total entries, virtual time range, screenshot timestamps, event kind breakdown.
- `debug-data/formatted-assets/<role>/<replayId>/` -- Pretty-printed JS/CSS from
  `snapshotted-assets/`. Only present if snapshotted assets exist. Use these instead of the originals.
- `context.json` fields: `screenshotMap` (screenshot-to-timestamp mapping), `replayComparison`
  (side-by-side event counts, virtual time, screenshot count), `fileMetadata` (byte sizes and
  line counts for key files).

### Diff Files (only when comparing replays)

These files are only generated when comparing replays -- i.e. when using `meticulous debug replay-diff`
or `meticulous debug replay` with `--baseReplayId`.

- `debug-data/diffs/<id>.json` -- Full diff data including replay metadata, test run config,
  and screenshot results. Can be very large (20K+ tokens). Only read this if you need the full context.
- `debug-data/diffs/<id>.summary.json` -- **Start here.** Compact summary with just the screenshot
  diff results: which screenshots differ, mismatch pixel counts, mismatch percentages, and changed
  section class names.
- `debug-data/log-diffs/<id>.diff` -- Raw unified diff of `logs.deterministic.txt` between head and base.
- `debug-data/log-diffs/<id>.filtered.diff` -- **Start here for diff investigation.** Noise-stripped
  version with tunnel URLs, S3 tokens, PostHog payloads removed. Hunks that only differ in
  noise are removed entirely.
- `debug-data/log-diffs/<id>.summary.txt` -- High-level summary: total changed lines, first divergence
  point, and categorized change counts with direction (e.g. "animation frames: +85 in head /
  -46 in base, net +39 in head").
- `debug-data/params-diffs/<id>.diff` -- JSON-aware diff of `launchBrowserAndReplayParams.json`
  between head and base. Keys are sorted and pretty-printed so only meaningful value changes appear.
- `debug-data/assets-diffs/<id>.txt` -- Comparison of snapshotted asset file lists between head
  and base (added/removed/changed by content hash). Not generated if assets are identical.
- `debug-data/screenshot-context/<id>.txt` -- Only generated with `--screenshot`. Shows ±30 lines
  of `logs.deterministic.txt` surrounding the screenshot for both head and base, with the
  screenshot line marked `>>>`.

### Other Data

- `debug-data/session-summaries/<sessionId>.txt` -- **Start here for session investigation.** Compact
  summary of each session: URL history, user event breakdown, network request stats (methods,
  status codes, domains, failures), storage counts, WebSocket connections, custom data, session
  context, and framework info.
- `debug-data/sessions/<sessionId>/data.json` -- Full session recording data including user events, network
  requests (HAR format), and application storage. Can be very large; prefer the session summary
  or use search to find relevant portions.
- `debug-data/test-run/<testRunId>.json` -- Test run configuration, results, commit SHA, and status.
- `debug-data/pr-metadata.json` -- Pull request metadata (title, URL, hosting provider, author, status) from
  the database. May not be present if no PR is associated with the test run.
- `debug-data/pr-diff.txt` -- Source code changes between the base and head commits. May not be present if
  commit SHAs are unavailable.
- `debug-data/project-repo/` -- Your codebase checked out at the relevant commit. Only present if
  the command was run from within a git repository.

## Screenshot Mapping

`context.json` includes a `screenshotMap` that maps each screenshot to its virtual timestamp
and event number. Use this to correlate screenshot filenames (e.g. `screenshot-after-event-00673.png`)
with specific points in the replay timeline and logs.

## Replay Comparison

`context.json` includes a `replayComparison` array with side-by-side stats for each replay:
total events, network requests, animation frames, virtual time, and screenshot count. Compare
head vs base entries to quickly spot drift (e.g. extra animation frames or different virtual time).

## File Sizes

`context.json` includes a `fileMetadata` array with the byte size and line count of key files.
Check this before attempting to read large files -- use grep/search or read specific line ranges
for files over ~5000 lines instead of reading them in full.

## Debugging Workflow

1. **Start with `debug-data/context.json`** -- Read this file for all IDs, statuses, file paths,
   `screenshotMap`, and `replayComparison`. If a `screenshot` field is present, this is the
   specific screenshot the user wants to investigate. Use `screenshotMap` to find its
   virtual timestamp and event number, then focus your analysis on events leading up to it.
2. **Check replay comparison** -- Compare head vs base entries in `replayComparison` for
   immediate drift signals (different event counts, animation frames, virtual time).
3. **Read filtered logs** -- For diffs: start with `debug-data/log-diffs/*.summary.txt` then
   `debug-data/log-diffs/*.filtered.diff`. For single replays: read `logs.deterministic.filtered.txt`
   inside the replay directory. Fall back to the raw `logs.deterministic.txt` only if you
   need unmodified output.
4. **Read timeline summaries** -- Check `debug-data/timeline-summaries/` for a compact overview of each
   replay's events, screenshot timestamps, and counts. Only read raw `timeline.json` if you
   need granular event-level detail.
5. **Inspect screenshot diffs** -- Start with `debug-data/diffs/<id>.summary.json` for a compact view of
   which screenshots differ and by how much. If a `debug-data/screenshot-context/` file exists, read it
   for the log lines surrounding the screenshot in both head and base.
   Only read the full `debug-data/diffs/<id>.json` if you need complete replay metadata.
6. **Check replay parameters** -- Read `debug-data/params-diffs/` for pre-computed diffs. For single
   replays, read `launchBrowserAndReplayParams.json` directly.
7. **Check assets diffs** -- Read `debug-data/assets-diffs/` to see if the snapshotted JS/CSS chunks
   differ between head and base.
8. **Analyze session data** -- Start with `debug-data/session-summaries/` for a quick overview of the
   session (URL history, user events, network stats). Only read the raw `debug-data/sessions/` data
   if you need specific details like request/response bodies or exact event selectors.
9. **Review the PR diff** -- Read `debug-data/pr-diff.txt` to see what code changed in this PR and
   correlate with screenshot diffs.
10. **Trace through formatted assets** -- Use `debug-data/formatted-assets/` (pretty-printed JS/CSS)
    instead of raw minified bundles when tracing code execution.
11. **Review your code** -- If `project-repo/` is present, check it for the relevant changes.
    For library source code, use `debug-data/formatted-assets/` which contains the bundled and
    pretty-printed versions of third-party code.

## Subagents

This workspace includes two specialized subagents in `.claude/agents/`:

### Planner

After the user describes their issue, **always delegate to the planner subagent first**
before starting your own investigation. The planner reads workspace summaries and metadata
to produce a structured debugging plan with prioritized investigation steps. Follow its plan
as your starting point.

### Summarizer

When you need to understand a large file (over 5000 lines), delegate to the summarizer
subagent instead of reading the file in full. The summarizer scans the file using grep and
targeted reads, returning a concise overview with line numbers for follow-up. This preserves
your context window for the actual investigation.

## Rules

- This workspace is for analysis and investigation. Focus on understanding root causes.
- When referencing files, use paths relative to this workspace root.
- Prefer `logs.deterministic.filtered.txt` over `logs.deterministic.txt` for general
  investigation. Use the raw version only when you need unmodified output.
- Prefer `logs.deterministic.txt` over `logs.concise.txt` when comparing between replays,
  since real-time timestamps are stripped.
- Session data files can be very large. Use grep/search to find relevant portions rather than
  reading entire files.
- Screenshot images are binary PNG files stored in the replay cache (not in this workspace).
  Reference them by path but analyze the diff metadata in JSON files instead.
- Check `fileMetadata` in `context.json` for file sizes before reading large files.
