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
- `screenshots/<name>.metadata.json` -- Per-screenshot metadata, including the captured `before.dom`
  (full HTML at screenshot time) and, when an interaction followed, `after.dom`.
- `screenshots/<name>.html` -- The `before.dom` extracted to a standalone HTML file. Prefer reading
  this over grepping the metadata JSON. The one-line `<!-- screenshot=... url=... vt=... -->`
  header at the top is for humans only and is not used when computing DOM diffs.
- `screenshots/<name>.after.html` -- Same for `after.dom`, only present when the metadata
  carried a non-null `after` side.

Note: screenshot PNGs (the binary images themselves) are **not** copied into the workspace --
only the `*.metadata.json` files that carry their DOM and the `.html` files extracted from
them. Reference PNG paths via `screenshotMap` in `context.json`; the actual PNG files are in
the replay cache at `~/.meticulous/replays/<replayId>/screenshots/`.

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
- `debug-data/dom-diffs/<headReplayId>-vs-<baseReplayId>-<screenshotBaseName>.diff` -- **Start
  here for DOM changes.** Unified diff with 3 lines of context per hunk of the HEAD vs BASE
  DOM at a specific screenshot, identical to the diff shown in the Meticulous product. Only
  written when the DOMs actually differ.
- `debug-data/dom-diffs/<headReplayId>-vs-<baseReplayId>-<screenshotBaseName>.full.diff` --
  The same hunks as the sibling `.diff`, but with full-file context. Read this when 3 lines
  of context around a hunk isn't enough to understand the surrounding DOM structure.
- `debug-data/dom-diffs/<headReplayId>-vs-<baseReplayId>.summary.txt` -- Per-pair index of DOM
  diffs: total screenshots compared, count breakdown by status, and a TSV table (`screenshot`,
  `status`, `hunks`, `diff_bytes`, `url`).

Note: DOM diffs are only generated when a `replayDiffId` is available (the normal
`meticulous debug replay-diff <id>` path). On the rare `meticulous debug replay --baseReplayId`
path there is no `replayDiffId`, so `dom-diffs/` is not generated — diff the per-replay
`screenshots/<baseName>.html` files directly with the system `diff` command instead.

Individual screenshots may also be marked `skipped-error` (backend fetch failed) or
`skipped-unsupported` (e.g. redacted variants, or screenshots whose identifier couldn't
be resolved from `timeline.json`) in the per-pair `.summary.txt`. For those, fall back
to diffing the two `screenshots/<baseName>.html` files directly.

### Other Data

- `debug-data/session-summaries/<sessionId>.txt` -- **Start here for session investigation.** Compact
  summary of each session: URL history, user event breakdown, network request stats (methods,
  status codes, domains, failures), storage counts, WebSocket connections, custom data, session
  context, and framework info.
- `debug-data/sessions/<sessionId>/data.json` -- Full session recording data including user events, network
  requests (HAR format), and application storage. Can be very large; prefer the session summary
  or use search to find relevant portions.
- `debug-data/test-run/<testRunId>.json` -- Test run configuration, results, commit SHA, and status.
<!-- if-pr-diff -->
- `debug-data/pr-diff.txt` -- Source code changes between the base and head commits.
<!-- end-if-pr-diff -->
- `debug-data/project-repo/` -- Your codebase checked out at the relevant commit. Only present if
  the command was run from within a git repository.

## Key `context.json` fields

- `screenshotMap` -- maps each screenshot filename to its virtual timestamp and event number.
  Use this to correlate e.g. `screenshot-after-event-00673.png` with a timeline position.
- `replayComparison` -- side-by-side per-replay stats (events, network requests, animation
  frames, virtual time, screenshots). Scan for head-vs-base drift.
- `domDiffMap` -- keyed by `"<headReplayId>-vs-<baseReplayId>/<screenshotBaseName>"`. Each
  entry carries `diffPath` (3-line-context), `fullDiffPath` (full-file-context),
  `totalHunks`, `bytes`, and `url`. Both paths are `null` when HEAD and BASE DOMs were
  identical. `fullDiffPath` alone can also be `null` when the full-context fetch failed
  while the canonical succeeded — in that case `diffPath` is non-null and still usable.
  Screenshots that are only-in-one-side, `skipped-error`, or `skipped-unsupported` have
  **no entry** in the map; consult the per-pair `.summary.txt` for the full list. Empty
  on the `--baseReplayId` single-replay path.
- `fileMetadata` -- byte sizes and line counts for key files. Check this before reading
  anything large; for files over ~5000 lines prefer grep/search or ranged reads.

## Debugging Workflow

Don't work through this top-to-bottom -- pick the phases relevant to the question. Phase 1
applies to every investigation; then pick phase 2 (comparing replays) or phase 3 (single
replay), and drop into phase 4 only as needed.

### 1. Orient

1. **Read `debug-data/context.json`** for IDs, statuses, file paths, `screenshotMap`,
   `replayComparison`, and `fileMetadata`. If a `screenshot` field is present, that's the
   specific screenshot the user wants to investigate -- use `screenshotMap` to find its
   virtual timestamp and focus analysis on events leading up to it.
2. **Scan `replayComparison`** for head-vs-base drift signals (event counts, animation
   frames, virtual time, screenshot count).

### 2. Investigate a diff (head vs base)

3. **Screenshot diffs** -- read `debug-data/diffs/<id>.summary.json` for which screenshots
   changed and by how much. If `debug-data/screenshot-context/` is present, read it for the
   log lines around each screenshot. Only open the full `diffs/<id>.json` for complete
   replay metadata.
4. **DOM diffs** -- for each changed screenshot, open the matching `.diff` under
   `debug-data/dom-diffs/` (use `domDiffMap` to navigate). If 3 lines of context around a
   hunk isn't enough, open the sibling `.full.diff` file (same hunks with full-file context,
   path on `domDiffMap[...].fullDiffPath`).
5. **Log diffs** -- **delegate to the log-diff-analyzer subagent** instead of reading
   `debug-data/log-diffs/*.filtered.diff` directly; only open the raw diff to verify
   specific findings.
<!-- if-pr-diff -->
6. **PR diff** -- **delegate to the pr-analyzer subagent** to correlate code changes with
   visual diffs. Only open `debug-data/pr-diff.txt` directly to verify findings.
<!-- end-if-pr-diff -->

### 3. Investigate a single replay

7. **Filtered logs** -- read `logs.deterministic.filtered.txt` inside the replay directory.
   Fall back to the raw `logs.deterministic.txt` only if you need unmodified output.
8. **Events index** -- grep `debug-data/events-index/<role>-<replayId>.txt` by kind,
   virtual time, or URL (e.g. `grep 'kind=screenshot'`, `grep 'api/v9/users'`). Prefer this
   over parsing `timeline.json`.
9. **Logs index** -- grep `debug-data/logs-index/<role>-<replayId>.txt` by source
   (`source=application`), type (`type=warn`), keyword, or virtual time (`vt=1234`).

### 4. Deeper dives (as needed)

10. **Screenshot timeline context** -- `debug-data/screenshot-timeline-context/` for the 30
    events before and 10 after each screenshot.
11. **Network activity** -- grep `debug-data/network-log/` for endpoints, status codes,
    domains.
12. **Virtual time progression** -- `diff` on `debug-data/vt-progression/` files to find
    where head and base diverge.
13. **Replay parameters** -- `debug-data/params-diffs/` for computed diffs, or
    `launchBrowserAndReplayParams.json` for a single replay.
14. **Assets** -- `debug-data/assets-diffs/` for snapshotted JS/CSS diffs,
    `debug-data/formatted-assets/` for pretty-printed bundles.
15. **Session data** -- `debug-data/session-summaries/<sessionId>.txt` first; only read raw
    `sessions/<id>/data.json` for specific request bodies or event selectors.
16. **Project source** -- `project-repo/` when present; `formatted-assets/` for third-party
    library code.

**Important**: Do NOT use Python one-liners to parse `timeline.json` or `logs.ndjson`. The
derived files above (`events-index/`, `logs-index/`, `network-log/`, `vt-progression/`,
`screenshot-timeline-context/`) are pre-computed and greppable. Use `timeline.ndjson`
(NDJSON format, one JSON object per line) if you need to grep the raw timeline data.

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

<!-- if-pr-diff -->
### PR Analyzer

To understand which code changes caused visual differences, **delegate to the pr-analyzer
subagent** instead of reading `debug-data/pr-diff.txt` directly. The analyzer reads the PR
diff and diff summaries, then returns a structured correlation mapping code changes to
specific screenshot diffs with judgments on expected vs unexpected changes.
<!-- end-if-pr-diff -->

## Rules

- This workspace is for analysis and investigation. Focus on understanding root causes.
- When referencing files, use paths relative to this workspace root.
- Prefer `logs.deterministic.filtered.txt` over `logs.deterministic.txt` for general
  investigation. Use the raw version only when you need unmodified output.
- Prefer `logs.deterministic.txt` over `logs.concise.txt` when comparing between replays,
  since real-time timestamps are stripped.
- Session data files can be very large. Use grep/search to find relevant portions rather than
  reading entire files.
- Screenshot PNGs (the binary images) are stored in the replay cache (not in this workspace).
  Reference them by path; for DOM content prefer reading
  `debug-data/replays/<role>/<replayId>/screenshots/<name>.html` (or `.after.html`) rather than
  parsing the raw `<name>.metadata.json`.
- For DOM changes between replays, prefer `debug-data/dom-diffs/` over diffing the two
  `<name>.html` files yourself -- the pre-computed `.diff` is identical to the diff shown
  in the Meticulous product and already has context lines added.
- Check `fileMetadata` in `context.json` for file sizes before reading large files.
