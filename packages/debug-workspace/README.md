# @alwaysmeticulous/debug-workspace

Internal package that provides the shared debug workspace pipeline used by the [Meticulous](https://meticulous.ai) CLI to investigate visual diffs and replays.

## What it does

Given a replay diff ID or replay ID(s), this package:

1. **Resolves context** — fetches metadata about the test run and its replay diffs from the Meticulous API.
2. **Downloads debug data** — downloads replay data, screenshots, and any additional artifacts to a local workspace directory.
3. **Generates a workspace** — scaffolds a structured directory with files and templates for investigating the diff.

## Usage

This package is not intended for direct use. It is consumed internally by `@alwaysmeticulous/cli` via the `meticulous debug` command.

## Key exports

- `runDebugPipeline` — runs the full pipeline (resolve → download → generate workspace).
- `resolveDebugContext` — resolves a `DebugContext` from a replay diff ID or replay ID(s).
- `downloadDebugData` — downloads replay data and screenshots into a workspace directory.
- `generateDebugWorkspace` — scaffolds the workspace directory from templates.
- `DebugContext`, `ReplayDiffInfo` — types describing the resolved debug context.

## Part of the Meticulous SDK

This package is part of the [meticulous-sdk](https://github.com/alwaysmeticulous/meticulous-sdk) monorepo.
