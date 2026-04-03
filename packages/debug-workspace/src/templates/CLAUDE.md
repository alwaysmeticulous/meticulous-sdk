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
  DOM mutations, etc.). Can be 1-2MB; prefer `debug-data/events-index/` or
  `debug-data/timeline-summaries/` for compact overviews.
- `timeline.ndjson` -- Same data as `timeline.json` but one JSON object per line (NDJSON format).
  Greppable with standard tools: `grep '"screenshot"' timeline.ndjson` to find screenshots,
  `grep '"pollyReplay"' timeline.ndjson` for network stubs.
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

- `debug-data/events-index/<role>-<replayId>.txt` -- **Use this instead of raw timeline.json.**
  One line per timeline event with index, virtual time, kind, and key data fields. Fully greppable:
  `grep 'kind=screenshot' events-index/head-abc.txt` to find screenshots,
  `grep 'kind=pollyReplay' events-index/head-abc.txt` for network stubs,
  `grep 'api/v9/users' events-index/head-abc.txt` for specific API calls.
- `debug-data/network-log/<role>-<replayId>.txt` -- Compact network request log with one line
  per request: method, URL, status, and match result. Grep for specific endpoints.
- `debug-data/vt-progression/<role>-<replayId>.txt` -- One virtual time value per line, extracted
  from `logs.ndjson`. Compare head vs base with `diff`. Use this instead of parsing `logs.ndjson`
  for virtual time progression.
- `debug-data/logs-index/<role>-<replayId>.txt` -- **Use this instead of raw logs.ndjson.**
  One line per log entry with index, current virtual time, source, type, and truncated message.
  Virtual-time-change entries appear as `[virtual-time-change -> <value>]`. Fully greppable:
  `grep 'source=application' logs-index/head-abc.txt` to filter by source,
  `grep -i 'error' logs-index/head-abc.txt` for keyword search,
  `grep 'vt=7648' logs-index/head-abc.txt` for events at a specific virtual time.
- `debug-data/screenshot-timeline-context/<role>-<replayId>-<screenshotId>.txt` -- Events
  surrounding each screenshot (30 before, 10 after) from the timeline. The screenshot line is
  marked with `>>>`. Use these to understand what happened right before a screenshot.
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
3. **Analyze log diffs** -- For diffs: **delegate to the log-diff-analyzer subagent** which
   reads the filtered diffs and summaries and returns a structured divergence report. Only
   read `debug-data/log-diffs/*.filtered.diff` directly if you need to verify specific details
   from the analyzer's report. For single replays (no diff): read `logs.deterministic.filtered.txt`
   inside the replay directory. Fall back to the raw `logs.deterministic.txt` only if you
   need unmodified output.
4. **Read events index** -- Check `debug-data/events-index/` for a greppable, one-line-per-event
   listing of the full timeline. Use grep to filter by kind, virtual time, or URL.
   For a higher-level overview, check `debug-data/timeline-summaries/`.
5. **Search log messages** -- Use `debug-data/logs-index/` for a greppable, one-line-per-entry
   summary of `logs.ndjson`. Grep by source (`source=application`), type (`type=warn`),
   keyword, or virtual time (`vt=1234`).
6. **Check screenshot timeline context** -- Read `debug-data/screenshot-timeline-context/` for
   the timeline events surrounding each screenshot (30 before, 10 after). The screenshot line
   is marked with `>>>`.
7. **Inspect screenshot diffs** -- Start with `debug-data/diffs/<id>.summary.json` for a compact view of
   which screenshots differ and by how much. If a `debug-data/screenshot-context/` file exists, read it
   for the log lines surrounding the screenshot in both head and base.
   Only read the full `debug-data/diffs/<id>.json` if you need complete replay metadata.
8. **Check network activity** -- Read `debug-data/network-log/` for a compact network request
   log. Grep for specific endpoints, status codes, or domains.
9. **Compare virtual time progression** -- Use `diff` on `debug-data/vt-progression/` files to
   find where head and base replays diverge in virtual time.
10. **Check replay parameters** -- Read `debug-data/params-diffs/` for pre-computed diffs. For single
    replays, read `launchBrowserAndReplayParams.json` directly.
11. **Check assets diffs** -- Read `debug-data/assets-diffs/` to see if the snapshotted JS/CSS chunks
    differ between head and base.
12. **Analyze session data** -- Start with `debug-data/session-summaries/` for a quick overview of the
    session (URL history, user events, network stats). Only read the raw `debug-data/sessions/` data
    if you need specific details like request/response bodies or exact event selectors.
13. **Analyze the PR diff** -- **Delegate to the pr-analyzer subagent** which reads
    `debug-data/pr-diff.txt` and the diff summaries, returning a structured correlation of
    code changes to screenshot diffs. Only read the PR diff directly if you need to verify
    specific details from the analyzer's report.
14. **Trace through formatted assets** -- Use `debug-data/formatted-assets/` (pretty-printed JS/CSS)
    instead of raw minified bundles when tracing code execution.
15. **Review your code** -- If `project-repo/` is present, check it for the relevant changes.
    For library source code, use `debug-data/formatted-assets/` which contains the bundled and
    pretty-printed versions of third-party code.

**Important**: Do NOT use Python one-liners to parse `timeline.json` or `logs.ndjson`. The derived
files above (`events-index/`, `network-log/`, `vt-progression/`, `logs-index/`,
`screenshot-timeline-context/`) are pre-computed and greppable. Use `timeline.ndjson` (NDJSON format,
one JSON object per line) if you need to grep the raw timeline data.

## Subagents

This workspace includes specialized subagents in `.claude/agents/`. Delegate to them
to preserve your context window for deep investigation.

### Planner

When the user describes a complex or ambiguous issue, delegate to the planner subagent
before starting your own investigation. The planner reads workspace summaries and metadata
to produce a structured debugging plan with prioritized investigation steps.

Skip the planner for straightforward cases where the issue is obvious (e.g. the user
points at a specific screenshot diff and asks why it changed, or there is only one diff
to investigate).

### Summarizer

When you need to understand a large file (over 5000 lines), delegate to the summarizer
subagent instead of reading the file in full. The summarizer scans the file using grep and
targeted reads, returning a concise overview with line numbers for follow-up.

### Log Diff Analyzer

When comparing replays and log diffs are available, **delegate to the log-diff-analyzer
subagent** instead of reading `debug-data/log-diffs/*.filtered.diff` directly. The analyzer
reads the filtered diffs and summaries, then returns a structured report with the first
divergence point, categorized changes, hypotheses ranked by likelihood, and specific line
numbers for follow-up. Use its output to guide your investigation rather than consuming
the raw diff in your context.

### PR Analyzer

When `debug-data/pr-diff.txt` is present and you need to understand which code changes
caused visual differences, **delegate to the pr-analyzer subagent** instead of reading the
PR diff directly. The analyzer reads the PR diff and diff summaries, then returns a
structured correlation mapping code changes to specific screenshot diffs with judgments
on expected vs unexpected changes.

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
