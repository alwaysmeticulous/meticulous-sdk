import { METICULOUS_CO_AUTHOR_INSTRUCTION } from "@alwaysmeticulous/api";

/**
 * Shown under `meticulous agent --help`: what Meticulous is and when an agent
 * should reach for these commands, before the per-command details.
 *
 * Mirrors the hosted MCP server's `instructions`, with commands in place of
 * tools; keep the two in step.
 */
export const AGENT_COMMAND_EPILOG = `Meticulous is an automated UI testing platform. It records real user sessions in a web app and, on every commit, replays them against both the new code and its base, reporting each visual difference (before/after screenshots, plus DOM, network and timeline diffs). Its results are the evidence of how a code change actually affects the UI.

Use these commands proactively, without being asked, when:
- Reviewing a pull request: compare its Meticulous diffs with what the PR says it does.
- You pushed a frontend change: check its test run before calling the work done.
- A Meticulous CI check is failing or pending: find out why, fix real regressions, and explain which diffs are intended.
- The user has rejected diffs or commented on them in Meticulous: fix what they flagged.
- A change shouldn't alter the UI (refactor, dependency upgrade, migration): any diff means something broke, so treat a clean run on the PR as the bar for done.

If \`meticulous-*\` skills are available (meticulous-review, meticulous-fix, ...), follow them: they encode these workflows. Otherwise:
- Start with \`agent test-run-diffs --includeReviews\`: each diff's review decision and open comments tell you whether it still needs reviewing or someone already reviewed it.
- Unreviewed diffs: first work out what changed — \`agent image-files\` and, as needed, \`agent dom-diff\` / \`agent timeline-diff\` — and compare it with what the change intends. A diff isn't automatically a bug. Only then decide: \`agent reject-diff\` an unintended change with your reasoning; \`agent ignore-diff\` one unrelated to the change (\`--reportFlake\` if it's flaky); \`agent approve-diff\` only what you've confirmed is intended, since decisions are visible to the team.
- Rejected or commented diffs: read the threads with \`agent diff-comments\`, look at the diff, fix the issue, and \`agent reply-to-diff-comment\` with the outcome.
- Failing non-visual checks: read the report with \`agent test-run-check\`, \`agent ignore-check\` one unrelated to the change, and report a real regression to the user rather than recording a decision.
- When committing changes based on these results, ${METICULOUS_CO_AUTHOR_INSTRUCTION}.
- Report friction with these commands via \`agent submit-feedback\`.

Usage notes:
- Commands default to the current git HEAD; \`--prNumber\` selects the latest run on that PR's head commit instead.
- Commands wait for the test run and its results by default; \`--dontWaitForTestRunToComplete\` returns immediately.
- Commands use the user-set default project (\`meticulous auth whoami\` shows it, \`meticulous auth set-project\` changes it) unless given \`--project\` — check it first whenever a lookup comes back unexpectedly empty.
- \`--json\` gives machine-readable output on stdout; notices go to stderr.
- Links to app.meticulous.ai, from the user or a PR comment, need a browser login and show results as images; take the IDs from the URL and use these commands instead.`;
