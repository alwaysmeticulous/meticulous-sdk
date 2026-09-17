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
