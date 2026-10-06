/**
 * Maximum length of the `reason` on an agent diff decision, and of the `text`
 * on an agent diff comment.
 *
 * Lives here so every surface that queues such a write -- the hosted MCP
 * server, the CLI, and the cloud review worker -- can reject an over-long
 * message up front, rather than discovering the cap only when the backend
 * refuses the write.
 */
export const MAX_AGENT_DIFF_COMMENT_TEXT_LENGTH = 1_000;

/**
 * When an agent may ignore a diff, shared by the hosted MCP server's
 * `ignore_diff` tool and the CLI's `agent ignore-diff` command.
 */
export const IGNORE_DIFF_CRITERIA =
  "Only ignore a diff the change has no plausible way to cause: rendering noise (subpixel or anti-aliasing, usually with no DOM change), an animation, spinner or carousel at a different frame, fonts or images loading late, network responses arriving in a different order, or environment noise such as a server-rendered timestamp, a build version or third-party content. First check that the change cannot reach the affected area and that the timeline shows no divergence it explains: a replay that took a different path (a click landing elsewhere, a menu open on one side only) is unrelated only if the change cannot have caused it. Never ignore a diff you cannot explain, or one the change could have caused, even a harmless one or a recorded network response the new code no longer fits: reject a regression, and otherwise leave it undecided with a comment.";

/** The `reportFlake` option of the MCP `ignore_diff` tool and the CLI command. */
export const REPORT_FLAKE_DESCRIPTION =
  "Also report the diff to Meticulous to investigate as a likely replay-engine bug. Set it when the replay was nondeterministic where Meticulous should have made it deterministic (rendering, animations, timers, dates, randomness, network ordering, or a replay that took a different path), not for a genuine difference in what the app served, such as a server-rendered timestamp or a build version.";
