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
  Credential-looking values (`Cookie`/`Authorization`/etc. header dumps, `Bearer`/`Basic` tokens)
  are always redacted, even in this "raw" file; other noise (tunnel URLs, S3 tokens, PostHog
  payloads) is left as-is here and only stripped in the filtered copy below.
- `logs.deterministic.filtered.txt` -- **Start here for single-replay investigation.**
  Noise-stripped version of the deterministic logs: tunnel URLs, S3 tokens, PostHog payloads,
  build hashes, and other non-deterministic patterns are replaced with placeholders. Prefer this
  over the raw version unless you need unmodified output.
- `logs.concise.txt` -- Full logs with both virtual and real timestamps, and trace IDs.
  Credential-looking values are redacted the same way as in `logs.deterministic.txt`.
- `timeline.ndjson` -- Detailed timeline of all replay events (user interactions, network requests,
  DOM mutations, etc.), one JSON object per line (NDJSON format). Can be 1-2MB; prefer
  `debug-data/events-index/` for a compact overview. Cookie/header
  values on network request entries are redacted. Entries are in the order the replay stored them:
  virtual time order for newer replays, the order they were reported (a network request when it
  completed) for older ones. Stored indices (e.g. a divergence's) are positions in this file.
  Greppable with standard tools: `grep '"screenshot"' timeline.ndjson` to find screenshots,
  `grep '"pollyReplay"' timeline.ndjson` for network stubs. Uncaught errors (`"kind":"error"`)
  carry a source-mapped stack in `data.mappedStack`, except unhandled promise rejections,
  which only have the raw, bundled-code stack in `data.nativeStack`.
- `metadata.json` -- Replay configuration, parameters, and environment info.
- `launchBrowserAndReplayParams.json` -- The exact parameters used to launch the replay.
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

- `debug-data/events-index/<role>-<replayId>.txt` -- **Use this instead of raw timeline.ndjson.**
  One line per timeline event, in virtual time order, with its index in `timeline.ndjson` (`[n]`),
  virtual time, kind, and key data fields. On older replays the indices are not in sequence, since
  their `timeline.ndjson` is not in virtual time order. Head and base line up regardless. Fully greppable:
  `grep 'kind=screenshot' events-index/head-abc.txt` to find screenshots,
  `grep 'kind=pollyReplay' events-index/head-abc.txt` for network stubs,
  `grep 'api/v9/users' events-index/head-abc.txt` for specific API calls. Error lines end
  with the error's top stack frame (marked `[unmapped]` when it points into bundled code).
- `debug-data/network-log/<role>-<replayId>.txt` -- **Start here for network problems.** One
  line per request, in the order they started: `timeline.ndjson` index, method, URL, GraphQL
  operation (`op=`), status and result, and for stubbed requests the recording that was served
  (`rec=#<order>@<recorded time>`) and how it was matched: `match=exact`,
  `match=normalized:<step>` (only the replay's host, timestamps or JSON key order differed: as
  good as exact), `match=loose:<step>` for the loosest matching step that was needed (e.g.
  `match=loose:drop-body`, `match=loose:fuzzed-url-right-0`), or `match=index:<decision>`.
  `SERVED-OTHER-URL=<path>` marks a response recorded for a different endpoint,
  `BODY-IGNORED` / `QUERY-IGNORED` a match that ignored the request body / query string,
  `PARTIAL-BATCH` a batched request with operations left unmatched, and `repair=<source>` a
  response patched or generated by network patching. `match=loose:` and each of these markers
  means the app may have received a response it didn't ask for.
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
surrounding each screenshot in virtual time order (30 before, 10 after), each with its
`timeline.ndjson` index. The screenshot line is marked with `>>>`. Use these to understand what happened right before a screenshot.
<!-- if-snapshot-assets -->
- `debug-data/formatted-assets/<role>/<replayId>/` -- Pretty-printed JS/CSS from
`snapshotted-assets/`. Use these instead of the originals.
<!-- end-if-snapshot-assets -->

### Diff Files (only when comparing replays)

These files are only generated when comparing replays.

- `debug-data/diffs/<id>.json` -- Full diff data including replay metadata, test run config,
  and screenshot results. Can be very large (20K+ tokens). Only read this if you need the full context.
- `debug-data/diffs/<id>.summary.json` -- **Start here.** Compact summary with just the screenshot
  diff results: which screenshots differ, mismatch pixel counts, mismatch percentages, the diff
  image hash (identical hashes mean identical pixel diffs), changed section class names, and
  for flakes the evidence that classified them.
- `debug-data/errors-diff/<headReplayId>-vs-<baseReplayId>.txt` -- Uncaught errors, unhandled
  promise rejections and `console.error` messages of both replays, grouped by message and
  marked `head-only`, `base-only` or `both`, with where each first occurs and the top stack
  frames of uncaught errors (`console.error` messages have no stack). Uncaught errors never
  appear in the replay logs, so this is the place to look for a crash.
- `debug-data/coverage-diff/<headReplayId>-vs-<baseReplayId>.txt` -- JS coverage of head vs
base: which of the PR's added and removed lines executed, source files that executed in only
one replay, and line ranges that differ in files the PR didn't change. Covers the whole
replay and, when a screenshot is targeted, that screenshot's own coverage.
<!-- if-snapshot-assets -->
- `debug-data/assets-diffs/<id>.txt` -- Comparison of snapshotted asset file lists between head
and base (added/removed/changed by content hash). Not generated if assets are identical.
<!-- end-if-snapshot-assets -->
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
be resolved from the timeline) in the per-pair `.summary.txt`. For those, fall back
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
- `replayComparison` -- side-by-side per-replay stats (the session replayed, timeline entries,
  network requests, replayed user events, virtual time, screenshots). Scan for head-vs-base
  drift. Different `sessionId`s mean head and base replayed different copies of the session
  (e.g. one patched), so their recorded responses can differ.
- `domDiffMap` -- keyed by `"<headReplayId>-vs-<baseReplayId>/<screenshotBaseName>"`. An
  entry is present **only** for screenshots with a real DOM diff to open; each carries
  `diffPath` (3-line-context), `fullDiffPath` (full-file-context), `totalHunks`, `bytes`,
  and `url`. `fullDiffPath` alone can be `null` when the full-context fetch failed while
  the canonical succeeded — in that case `diffPath` is non-null and still usable.
  Screenshots that are identical, only-in-one-side, `skipped-error`, or
  `skipped-unsupported` have **no entry** in the map; consult the per-pair `.summary.txt`
  for the full list (it records every compared screenshot and its status).
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
2. **Scan `replayComparison`** for head-vs-base drift signals (the replayed session,
   timeline entry, network request and user event counts, virtual time, screenshot count).

### 2. Investigate a diff (head vs base)

3. **Screenshot diffs** -- read `debug-data/diffs/<id>.summary.json` for which screenshots
   changed and by how much. Read `debug-data/screenshot-timeline-context/` for the events
   leading up to each screenshot. Only open the full `diffs/<id>.json` for complete
   replay metadata.
4. **DOM diffs** -- for each changed screenshot, open the matching `.diff` under
   `debug-data/dom-diffs/` (use `domDiffMap` to navigate). If 3 lines of context around a
   hunk isn't enough, open the sibling `.full.diff` file (same hunks with full-file context,
   path on `domDiffMap[...].fullDiffPath`).
5. **Errors** -- read `debug-data/errors-diff/`. A `head-only` uncaught error before the
   screenshot usually explains a broken or missing UI.
6. **Network** -- grep `debug-data/network-log/` for loose matches (`match=loose:`,
`SERVED-OTHER-URL`, `PARTIAL-BATCH`), `repair=` and failed requests before the screenshot
(see 3b below).
<!-- if-pr-description -->
7. **PR description** -- read `debug-data/pr-description.txt` to understand the intended
   change that triggered this test run.
   <!-- end-if-pr-description -->
   <!-- if-pr-diff -->
8. **PR diff** -- read the parts of `debug-data/pr-diff.txt` that touch the code behind the
changed UI (grep it by file and symbol names from the DOM diff).
<!-- end-if-pr-diff -->
9. **Coverage** -- read `debug-data/coverage-diff/` to check whether the changed code ran at
   all, and which files ran in only one replay.

### 3. Investigate a single replay

10. **Filtered logs** -- read `logs.deterministic.filtered.txt` inside the replay directory.
    Fall back to the raw `logs.deterministic.txt` only if you need unmodified output.
11. **Events index** -- grep `debug-data/events-index/<role>-<replayId>.txt` by kind,
    virtual time, or URL (e.g. `grep 'kind=screenshot'`, `grep 'api/v9/users'`). Prefer this
    over parsing `timeline.ndjson`.
12. **Logs index** -- grep `debug-data/logs-index/<role>-<replayId>.txt` by source
    (`source=application`), type (`type=warn`), keyword, or virtual time (`vt=1234`).

### 3b. Check network match quality

A response recorded for a different request is a common root cause of diffs. When the
replay shows "Low accuracy: Network issues", or `network-log/` has loose matches or `repair=`
entries before the first visual difference, check them first
(`grep -E 'match=loose|SERVED-OTHER-URL|PARTIAL-BATCH|repair=' network-log/head-abc.txt`):

- `SERVED-OTHER-URL=<path>`: the app asked for one endpoint and was served a response
  recorded for another, so its schema is likely wrong for the requesting code.
- `match=loose:<step>`, `BODY-IGNORED`, `QUERY-IGNORED`: the request's URL, query or body didn't
  match any recording exactly, so a similar one was served. Compare the request with the
  recording (`rec=#<order>` in the session's `data.json`) when the difference matters, e.g.
  GraphQL variables or a new field.
- `PARTIAL-BATCH`: some operations of a batched request had no recording.
- `repair=<source>`: the response was patched or generated by network patching rather than
  recorded.
- Several recordings of the same request (different `rec=#<order>`) are served in recorded
  order, so a PR that adds or removes a call can shift which recording each later call gets.

For details, the request's `timeline.ndjson` entry (its `[n]` index) has the full
`data.pollyRequest` (the actual request) and `data.matchedRequest` (the recording served).

When you identify such a mismatch, report it as the likely root cause: the diff stems from
network matching, not from a real code regression.

### 4. Deeper dives (as needed)

13. **Virtual time progression** -- `diff` on `debug-data/vt-progression/` files to find
    where head and base diverge.
14. **Wall-clock timing** -- `logs.concise.txt` has real timestamps next to virtual ones,
for races between virtual and real time.
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

**Important**: Do NOT use Python one-liners to parse `timeline.ndjson` or `logs.ndjson`. The
derived files above (`events-index/`, `logs-index/`, `network-log/`, `vt-progression/`,
`screenshot-timeline-context/`, `errors-diff/`, `coverage-diff/`) are pre-computed and
greppable. Use `timeline.ndjson` (NDJSON format, one JSON object per line) if you need to grep
the raw timeline data. To compare two replays' logs, `diff` their `logs.deterministic.filtered.txt`.

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
