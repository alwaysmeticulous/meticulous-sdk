---
"@alwaysmeticulous/client": minor
"@alwaysmeticulous/cli": minor
---

feat(cli): test-run-diffs --includeAllDiffs and --includeDomDiffIds

`meticulous agent test-run-diffs` now aligns with the curated diffs-summary
endpoint. The client sends `clientVersion=2` on every request, so the backend
returns the selected representative subset by default and the command flattens
the response into a single priority-ordered list.

New flags: `--includeDomDiffIds` (adds the `domDiffIds` column),
`--includeAllDiffs` (returns every diff, adds the `isSelected` column),
`--includeMatches` (now implies `--includeAllDiffs`), and `--orderByReplayDiffs`
(orders by replay diff then event index, adding the `index`/`total` columns).

The command also reports `Test run is not complete (status: …)` and exits for
in-progress runs (use `--waitForTestRunToComplete` to block — only suggested
when waiting can actually help), fails fast on `Aborted`/`ExecutionError`, and
gives up polling after 10 minutes. `Partial` runs are session-pool bases rather
than test runs for a specific change, so `test-run-diffs` now rejects them as
having no diffs to show instead of suggesting a no-op wait. The same
completed/failed/not-complete handling is otherwise applied consistently across
`test-run-diffs`, `js-coverage`, and `test-run-for-commit` — so `js-coverage`
now treats `Partial`/`Aborted`/`ExecutionError` runs as having no usable
results rather than querying them.

Note: the default TSV output changed — `index`/`total` and `domDiffIds` are no
longer emitted unless their flags are set, and rows default to priority order
rather than replay-diff grouping. To approximate the previous output, pass
`--includeAllDiffs --includeDomDiffIds --orderByReplayDiffs`. This requires a
backend that understands `clientVersion=2`; older backends keep the legacy
response.
