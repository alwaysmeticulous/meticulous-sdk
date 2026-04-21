# @alwaysmeticulous/debug-workspace

Shared package that provides the debug workspace pipeline used by the
[Meticulous](https://meticulous.ai) CLI (`meticulous debug`) to investigate visual diffs
and replay issues.

## What it does

Given a replay diff ID or replay ID(s), this package:

1. **Resolves context** -- Fetches metadata about the test run and its replay diffs from the
  Meticulous API, producing a `DebugContext` with all related IDs.
2. **Downloads debug data** -- Downloads replay data (logs, timeline, params, assets), session
  recordings, replay diffs, and test run metadata into a local workspace directory. Downloads
   run in parallel with configurable concurrency.
3. **Generates a workspace** -- Scaffolds a structured directory with:
  - **Templates** -- `CLAUDE.md`, agents, rules, skills, hooks, and settings copied into
   `.claude/` for use with Claude Code.
  - **Derived analysis files** -- Pre-computed artifacts that make large replay data greppable
  and manageable:
    - Filtered logs (noise-stripped deterministic logs)
    - Log diffs (raw, filtered, and summary)
    - Diff summaries (compact screenshot diff results)
    - Events index (one-line-per-event timeline summary)
    - Network log (compact request log)
    - VT progression (virtual time values for diffing)
    - Logs index (one-line-per-entry log summary)
    - Screenshot timeline context (events surrounding each screenshot)
    - Timeline summaries, session summaries, params diffs, assets diffs
    - Formatted assets (pretty-printed JS/CSS)
    - Screenshot DOM snapshots (per-screenshot `<name>.html` files extracted from
    `<name>.metadata.json`, written alongside each replay's `screenshots/` directory)
    - DOM diffs (per-screenshot unified diffs of HEAD vs BASE pretty-printed HTML, written
    to `dom-diffs/` as `.diff`, `.full.diff`, and per-pair `.summary.txt` files --
    byte-compatible with the Meticulous product's DOM diff view)
    - PR diff (source code changes between base and head commits)
  - **Context JSON** -- Machine-readable metadata with all IDs, paths, file sizes, screenshot
  map, and replay comparison stats.

## Overlay templates

`generateDebugWorkspace` accepts an optional `additionalTemplatesDir` parameter. Files in this
overlay directory take precedence over the base templates bundled with this package. For
subdirectories (agents, rules, hooks, skills), base files are copied first, then overlay files
are copied on top -- so overlays can add new files or replace specific ones by name.

This is used by `met_debug` (in the internal Meticulous repo) to provide admin-specific
templates, skills, and a custom `CLAUDE.md` without forking the base package.

## Usage

This package is consumed by `@alwaysmeticulous/cli` via the `meticulous debug` command.

```typescript
import { runDebugPipeline } from "@alwaysmeticulous/debug-workspace";

await runDebugPipeline({
  client,
  replayDiffId: "some-replay-diff-id",
  screenshot: "screenshot-after-event-00042.png",
  createWorktree: (ctx, workspaceDir) => createProjectWorktree({ debugContext: ctx, workspaceDir }),
  onWorkspaceReady: (workspaceDir, projectRepoDir) => presentWorkspace({ workspaceDir, projectRepoDir }),
});
```

Or use individual steps for more control:

```typescript
import {
  resolveDebugContext,
  downloadDebugData,
  generateDebugWorkspace,
} from "@alwaysmeticulous/debug-workspace";

const debugContext = await resolveDebugContext({ client, replayDiffId });
await downloadDebugData({ client, debugContext, workspaceDir });
generateDebugWorkspace({ debugContext, workspaceDir, projectRepoDir });
```

## Key exports

- `runDebugPipeline` -- Runs the full pipeline (resolve, download, generate workspace).
- `resolveDebugContext` -- Resolves a `DebugContext` from a replay diff ID or replay ID(s).
- `downloadDebugData` -- Downloads replay data and artifacts into a workspace directory.
- `generateDebugWorkspace` -- Scaffolds the workspace directory from templates and generates
all derived analysis files.
- `DebugContext`, `ReplayDiffInfo` -- Types describing the resolved debug context.
- `DEBUG_DATA_DIRECTORY`, `getDebugSessionsDir` -- Path constants.

## Part of the Meticulous SDK

This package is part of the [meticulous-sdk](https://github.com/alwaysmeticulous/meticulous-sdk)
monorepo.