/**
 * Public Meticulous docs. These pages need no auth and are rendered at build
 * time, so the install agent can fetch them directly instead of us shipping
 * copies into the onboard workspace (see templates/CLAUDE.md → Reference docs).
 */
export const METICULOUS_DOCS_BASE_URL = "https://app.meticulous.ai/docs";

/** Host that must be fetchable for the agent to read the docs above. */
export const METICULOUS_DOCS_HOST = "app.meticulous.ai";

/** Introduction to the ways coding agents can interact with Meticulous. */
export const AGENTS_SETUP_DOCS_URL = `${METICULOUS_DOCS_BASE_URL}/agents/setup-for-agents`;

/** Docs for installing and linking the GitHub App (status checks). */
export const GITHUB_ACTIONS_DOCS_URL = `${METICULOUS_DOCS_BASE_URL}/github-actions-v2`;
