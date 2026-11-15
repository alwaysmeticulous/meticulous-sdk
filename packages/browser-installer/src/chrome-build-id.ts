// Kept as a literal rather than read from puppeteer-core's PUPPETEER_REVISIONS,
// so the published package doesn't depend on puppeteer-core (and through it on
// chromium-bidi). chrome-build-id.spec.ts fails when it drifts from the
// workspace's puppeteer-core.
export const CHROME_BUILD_ID = "156.0.8078.47";
