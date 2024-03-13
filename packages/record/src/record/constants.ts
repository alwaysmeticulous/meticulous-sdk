export const DEFAULT_UPLOAD_INTERVAL_MS = 1_000; // 1 second

export const DEFAULT_NAVIGATION_TIMEOUT_MS = 120_000; // 2 minutes

export const INITIAL_METICULOUS_RECORD_DOCS_URL =
  "https://app.meticulous.ai/docs/recording-a-test";

// Initial page shown when recording a login flow session.
export const INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL =
  "https://app.meticulous.ai/docs/recording-a-login-flow";

// Page shown while saving a login flow session recording.
export const METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL =
  "https://app.meticulous.ai/docs/recording-a-login-flow-saving";

export const METICULOUS_BYPASS_CSP_DOCS_URL =
  "https://app.meticulous.ai/docs/recorder-errors/re-run-with-bypass-csp";

export const COMMON_RECORD_CHROME_LAUNCH_ARGS = [
  // Unsets navigator.webdriver during recording to provide more consistent behavior
  // between Chrome for Test and Chrome.
  "--disable-blink-features=AutomationControlled",
];

// We don't require https://snippet.meticulous.ai since the snippet is injected via
// evaluateOnNewDocument
export const REQUIRED_CSP_ORIGINS = [
  "https://cognito-identity.us-west-2.amazonaws.com",
  "https://user-events-v3.s3-accelerate.amazonaws.com",
];
