---
"@alwaysmeticulous/client": patch
"@alwaysmeticulous/custom-checks": patch
---

Register a test run as expecting custom check results so the Meticulous UI's "Checks" tab is only shown for runs that will actually report results. `findTestRunForCustomChecks` (and `findTestRunByCommitAndWaitForCompletion`) now fire a best-effort `POST test-runs/:id/expect-custom-checks` against the effective (merged-after-network-patching) run once it is resolved — i.e. the run the user actually sees — before the caller downloads snapshots and computes the checks. Adds the `markTestRunExpectsCustomChecks` client API. The call never fails the wait: older backends without the endpoint, transient errors, or a 404 are tolerated, and reporting results marks the run as a backstop.

Adds a `skipRegisteringExpectedCustomChecks` option to the wait helpers to suppress that signal — useful when iterating on a custom check locally against a real test run (e.g. a dry run that won't report results: you can wait for it and pull its snapshots without making the run show a "waiting for checks" tab).

**Breaking:** renames `findTestRunByIdAndWaitForCompletion` to `findTestRunForCustomChecks` (and its options type `FindTestRunByIdAndWaitForCompletionOptions` to `FindTestRunForCustomChecksOptions`) to make its custom-checks purpose explicit. Call it at the start of a custom check script, before computing/reporting results.
