# @alwaysmeticulous/agent-traces

## 3.2.0

### Minor Changes

- [#15939](https://github.com/alwaysmeticulous/meticulous/pull/15939) [`db89e77`](https://github.com/alwaysmeticulous/meticulous/commit/db89e774514e911d09b04cba9abec95bf43f90a8) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Adds `findTraceSessions`, which finds the agent sessions in trace files and
  directories a user names (Claude Code, Codex, Cursor and Pi transcripts,
  `opencode export` files and ATIF trajectories), detecting each file's format
  from its contents and grouping subagents with their sessions. Adds the
  `other` agent for ATIF from other harnesses, the `imported` environment,
  `rawFormat: "atif"` on raw envelopes (so tool output exclusion strips raw
  ATIF files), `statsFromAtif`, `validateAtifTrajectory`, and the
  `~/.meticulous/traces-config.json` reader.

- [#15939](https://github.com/alwaysmeticulous/meticulous/pull/15939) [`db89e77`](https://github.com/alwaysmeticulous/meticulous/commit/db89e774514e911d09b04cba9abec95bf43f90a8) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - New package: converts Claude Code, Codex, Cursor, Devin, OpenCode and Pi
  session transcripts to ATIF trajectories and prepares them for upload to
  Meticulous's agent traces (tool output exclusion, secret redaction, gzip and
  content hashing).
