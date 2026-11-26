/**
 * Single source of truth for the production Meticulous GitHub App's identity.
 * Derive every URL and login from the slug rather than hardcoding them.
 *
 * Files that can't import this (the post-deployment workflow, agent skill
 * markdown, committed PR-comment snapshots) repeat the literal values and point
 * back here.
 */
export const GITHUB_APP_SLUG = "meticulous";

export const GITHUB_APP_URL = `https://github.com/apps/${GITHUB_APP_SLUG}`;

export const GITHUB_APP_INSTALL_URL = `${GITHUB_APP_URL}/installations/new`;

export const GITHUB_APP_BOT_LOGIN = `${GITHUB_APP_SLUG}[bot]`;

/** The bot user's numeric GitHub ID, which doesn't change when the app is renamed. */
export const GITHUB_APP_BOT_USER_ID = 87660985;

/** The noreply address that makes GitHub render the app as a commit co-author. */
export const GITHUB_APP_BOT_NOREPLY_EMAIL = `${GITHUB_APP_BOT_USER_ID}+${GITHUB_APP_BOT_LOGIN}@users.noreply.github.com`;
