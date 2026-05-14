# Meticulous Debug Workspace

## What This Is

You are in a debugging workspace for the Meticulous automated UI testing platform.
You are investigating a replay issue (flaky behavior, unexpected diffs, or replay failures).

`debug-data/context.json` is the index for this workspace. Read it first; it lists all IDs, paths,
metadata, and what data is available.

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

- **`debug-data/context.json`** -- Index of IDs, paths, metadata, and what data is available
  in this workspace. Read this first.
- **`debug-data/`** -- All downloaded replay data, session recordings, diffs, and
  pre-computed analysis artifacts.
<!-- if-local-cli -->
- **`project-repo/`** -- (Optional) Your codebase checked out at the relevant commit.
  Only present if the command was run from within a git repository.
<!-- end-if-local-cli -->

## debug-data/ Contents

Data falls into three categories: per-replay files (always present), diff files (only when
comparing replays), and other data.

### Per-Replay Files (always available)

Replay data is organized into `head/` and `base/` subdirectories under
`debug-data/replays/`. All files are searchable and can be found via glob/search.

Each replay directory (`debug-data/replays/<role>/<replayId>/`) contains:

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
- `stack-traces.ndjson` -- JavaScript stack traces captured during replay (if any errors
  occurred), one JSON object per line.
- `accuracy.json` -- Replay accuracy assessment comparing to expected behavior.
- `cookies.json` -- Cookies captured at session record time. Rarely needed; useful only when
  authentication or cookie-driven behavior is part of the investigation.
- `mapped-coverage.json` -- JS code coverage for the whole replay, mapped back to source files.
  Cross-reference with `pr-diff.txt` to check whether changed code actually executed during the replay.
- `mapped-per-screenshot-js-coverage/<screenshotId>.json` -- Same coverage broken down per
  screenshot. Use this to localize which code ran around a specific diff.
<!-- if-snapshot-assets -->
- `snapshotted-assets/` -- Static assets (JS/CSS) that were captured and used during replay.
<!-- end-if-snapshot-assets -->
- `screenshots/<name>.metadata.json` -- Per-screenshot metadata, including the captured `before.dom`
  (full HTML at screenshot time).
- `screenshots/<name>.html` -- The `before.dom` extracted to a standalone HTML file. Prefer reading
  this over grepping the metadata JSON. The one-line `<!-- screenshot=... url=... vt=... -->`
  header at the top is for humans only and is not used when computing DOM diffs.

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
<!-- if-snapshot-assets -->
- `debug-data/formatted-assets/<role>/<replayId>/` -- Pretty-printed JS/CSS from
  `snapshotted-assets/`. Use these instead of the originals.
<!-- end-if-snapshot-assets -->

### Diff Files (only when comparing replays)

These files are only generated when comparing replays.

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
<!-- if-snapshot-assets -->
- `debug-data/assets-diffs/<id>.txt` -- Comparison of snapshotted asset file lists between head
  and base (added/removed/changed by content hash). Not generated if assets are identical.
<!-- end-if-snapshot-assets -->
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

<!-- if-local-cli -->
Note: DOM diffs are only generated when a `replayDiffId` is available (the normal
`meticulous debug replay-diff <id>` path). On the rare `meticulous debug replay --baseReplayId`
path there is no `replayDiffId`, so `dom-diffs/` is not generated — diff the per-replay
`screenshots/<baseName>.html` files directly with the system `diff` command instead.
<!-- end-if-local-cli -->

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
<!-- if-pr-description -->
- `debug-data/pr-description.txt` -- Pull request description/body.
<!-- end-if-pr-description -->
<!-- if-pr-diff -->
- `debug-data/pr-diff.txt` -- Source code changes between the base and head commits.
<!-- end-if-pr-diff -->

## Key `context.json` fields

- `screenshotMap` -- maps each screenshot identifier to its virtual timestamp and event number.
  Use this to correlate e.g. `screenshot-after-event-00673` with a timeline position.
- `replayComparison` -- side-by-side per-replay stats (events, network requests, animation
  frames, virtual time, screenshots). Scan for head-vs-base drift.
- `domDiffMap` -- keyed by `"<headReplayId>-vs-<baseReplayId>/<screenshotBaseName>"`. Each
  entry carries `diffPath` (3-line-context), `fullDiffPath` (full-file-context),
  `totalHunks`, `bytes`, and `url`. Both paths are `null` when HEAD and BASE DOMs were
  identical. `fullDiffPath` alone can also be `null` when the full-context fetch failed
  while the canonical succeeded — in that case `diffPath` is non-null and still usable.
  Screenshots that are only-in-one-side, `skipped-error`, or `skipped-unsupported` have
  **no entry** in the map; consult the per-pair `.summary.txt` for the full list.
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
<!-- if-pr-description-and-diff -->
6. **PR description and diff** -- read `debug-data/pr-description.txt` first to understand
   the intended change, then **delegate to the pr-analyzer subagent** to correlate code
   changes with visual diffs. Only open `debug-data/pr-diff.txt` directly to verify findings.
<!-- end-if-pr-description-and-diff -->
<!-- if-pr-description-only -->
6. **PR description** -- read `debug-data/pr-description.txt` to understand the intended
   change that triggered this test run.
<!-- end-if-pr-description-only -->
<!-- if-pr-diff-only -->
6. **PR diff** -- **delegate to the pr-analyzer subagent** to correlate code changes with
   visual diffs. Only open `debug-data/pr-diff.txt` directly to verify findings.
<!-- end-if-pr-diff-only -->

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
14. **Code coverage** -- `mapped-coverage.json` for whole-replay coverage; correlate executed
    code with `pr-diff.txt` to see whether the changed lines actually ran. Use
    `mapped-per-screenshot-js-coverage/<screenshotId>.json` to localize what executed before
    a specific screenshot.
<!-- if-snapshot-assets -->
15. **Assets** -- `debug-data/assets-diffs/` for snapshotted JS/CSS diffs,
    `debug-data/formatted-assets/` for pretty-printed bundles.
<!-- end-if-snapshot-assets -->
16. **Session data** -- `debug-data/session-summaries/<sessionId>.txt` first; only read raw
    `sessions/<id>/data.json` for specific request bodies or event selectors.
<!-- if-local-cli -->
17. **Project source** -- `project-repo/` when present.
<!-- if-snapshot-assets -->
    For third-party library code, use `debug-data/formatted-assets/`.
<!-- end-if-snapshot-assets -->
<!-- end-if-local-cli -->

**Important**: Do NOT use Python one-liners to parse `timeline.json` or `logs.ndjson`. The
derived files above (`events-index/`, `logs-index/`, `network-log/`, `vt-progression/`,
`screenshot-timeline-context/`) are pre-computed and greppable. Use `timeline.ndjson`
(NDJSON format, one JSON object per line) if you need to grep the raw timeline data.

## Subagents

Specialized subagents are available via the Task tool — the SDK surfaces each one's
name, tools, and description automatically; you don't need to enumerate them. Two
general-purpose subagents are worth calling out because they apply across all phases
of the workflow:

- **Planner** — when the user describes a complex or ambiguous issue, delegate to
  the planner before starting your own investigation. It reads workspace summaries
  and metadata to produce a structured debugging plan with prioritized investigation
  steps. Skip it for straightforward cases (e.g. a specific screenshot diff with an
  obvious focus, or a single diff to investigate).
- **Summarizer** — when you need to understand a large file (over 5000 lines),
  delegate to the summarizer instead of reading the file in full. It scans with
  grep and targeted reads and returns a concise overview with line numbers for
  follow-up.

Phase-specific subagents (log-diff-analyzer, pr-analyzer) are referenced from the
workflow steps above.

## Rules

- This workspace is for analysis and investigation. Focus on understanding root causes.
- When referencing files, use paths relative to this workspace root.
- Prefer `logs.deterministic.filtered.txt` over `logs.deterministic.txt` for general
  investigation. Use the raw version only when you need unmodified output.
- Prefer `logs.deterministic.txt` over `logs.concise.txt` when comparing between replays,
  since real-time timestamps are stripped.
- Session data files can be very large. Use grep/search to find relevant portions rather than
  reading entire files.
- For per-screenshot DOM content, prefer reading
  `debug-data/replays/<role>/<replayId>/screenshots/<name>.html` rather than parsing the raw
  `<name>.metadata.json`.
- For DOM changes between replays, prefer `debug-data/dom-diffs/` over diffing the two
  `<name>.html` files yourself -- the pre-computed `.diff` is identical to the diff shown
  in the Meticulous product and already has context lines added.
- Check `fileMetadata` in `context.json` for file sizes before reading large files.
