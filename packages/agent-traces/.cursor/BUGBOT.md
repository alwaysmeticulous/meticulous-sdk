## Public package constraints

This package is published publicly and used by the agent traces uploader binary and the Meticulous CLI. Flag imports of packages that aren't under `public_packages/` (e.g. `@alwaysmeticulous/common-utils` or `@alwaysmeticulous/ids`), new runtime dependencies, and APIs Node 18 lacks or the uploader's Bun binary can't run (`node:sqlite`, `bun:*`). Discovering sessions on a machine (agents' data directories, spools, databases) belongs in `packages/agent-traces-uploader`, not here; `src/from-files/` only reads the paths a user names.

## Docs describing this code live elsewhere

If `src/from-files/` changes which formats or layouts it reads, check the "Uploading existing traces" section of `packages/webapp-frontend/src/components/docs/content/unlisted/agent-traces.ts` and this package's README.

If the converters, tool output exclusion (`src/tool-output-exclusion/`), redaction (`src/redact/`), identity (`src/identity/`) or `prepareSessionUpload` change, check `packages/agent-traces-uploader/__docs__/README.md`. If Cursor's parsing or merging (`src/cursor/`) changes, check `packages/agent-traces-uploader/src/cursor/__docs__/README.md`.

## Agent trace analysis reads this ATIF

`packages/agent-traces-analysis` normalises the ATIF these converters produce. If `src/types/atif.types.ts` or `src/atif/` change, or a converter changes a tool's `function_name` or the argument key holding its path, how token metrics are filled (`prompt_tokens`, `cached_tokens`, `extra.cache_creation_input_tokens`), how truncated observations record `original_length_chars` or tool durations (`extra.duration_ms`), or how subagents are embedded (`subagent_trajectories`, `extra.agent_type`), check that package's `src/normalise/` (especially `tool-path-extractors.ts`) and `src/__docs__/README.md`.

If Cursor cloud-agent hook handling (`src/cursor/`, `src/identity/detect-environment.ts`) changes, e.g. Cursor starts reporting token usage in cloud hooks, check whether `packages/agent-traces-analysis/src/cursor-usage/__docs__/README.md` needs updating.

`packages/agent-traces-analysis/src/devin-sessions/estimate-devin-token-usage.ts` estimates Devin traces' tokens from the steps `src/devin/build-devin-steps.ts` produces (one agent step per model call, compaction summaries as `is_compact_summary` user steps). If that mapping changes, or Devin starts reporting tokens in its hooks, check the estimator and `devin-sessions/__docs__/README.md` there.

## PR and branch helpers are shared

`src/git/pull-request-url.ts` and `src/git/branch-names.ts` are used both by the `pr-refs` analyzer in `packages/agent-traces-analysis` (extracting refs) and by `packages/webapp-backend/src/agent-traces/related/` (building the PR side of the match). A change that normalises repositories or branches differently on one side breaks matching; check both, and their `__docs__`.

## Devin secrets

`src/devin/redact-devin-event-files.ts` blanks the environment Devin's `exec` tool input carries, which includes session secrets. Flag changes that weaken it.
