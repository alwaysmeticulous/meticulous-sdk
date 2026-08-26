import { METICULOUS_SUPPORT_EMAIL } from "src/lib/next/next.constants";

export const METICULOUS_VERCEL_INTEGRATION_INSTALL_URL =
  "https://vercel.com/integrations/meticulous";

export const METICULOUS_GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/alwaysmeticulous/installations/new";

export const WHERE_CAN_I_REACH_OUT_FOR_SUPPORT = `
  ### Where can I reach out for support?

  Reach out to [${METICULOUS_SUPPORT_EMAIL}](mailto:${METICULOUS_SUPPORT_EMAIL}) and we'll be happy to help.
  `;

export const METICULOUS_DEBUG_PR_LABEL = "[meticulous debug]";

export const SIMULATION_TAB_NAMES = {
  DEBUG_LOCALLY: "Debug Locally",
  TIMELINE_AND_LOGS: "Timeline & Logs",
};

/**
 * Keep in sync with [@alwaysmeticulous/browser-utils](https://github.com/alwaysmeticulous/meticulous/blob/9c89cf58ae240bea0f9201c5d704a0bcc53e61bd/packages/browser-utils/src/utils/public-api-classes.ts#L11).
 */
export const METICULOUS_REDACT_RECORDING_CLASS = "meticulous-redact-recording";

/**
 * Keep in sync with [@alwaysmeticulous/browser-utils](https://github.com/alwaysmeticulous/meticulous/blob/9c89cf58ae240bea0f9201c5d704a0bcc53e61bd/packages/browser-utils/src/utils/public-api-classes.ts#L11).
 */
export const METICULOUS_MASK_RECORDING_PREVIEW_CLASS =
  "meticulous-mask-recording-preview";

export const GITHUB_ACTION_UPLOAD_ASSETS_NAME =
  "alwaysmeticulous/report-diffs-action/upload-assets";

export const GITHUB_ACTION_UPLOAD_CONTAINER_NAME =
  "alwaysmeticulous/report-diffs-action/upload-container";
