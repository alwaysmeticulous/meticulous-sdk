/**
 * The published SDK pins puppeteer-core 24.x, whose revisions module lives at
 * the build-specific `lib/cjs` / `lib/esm` paths rather than this one, so this
 * specifier does not resolve there. Declaring it keeps the >=25 import in
 * `browser-installer.ts` a static literal — which is what lets the webpack
 * bundles (crawler, replay-orchestrator, neither of which ships node_modules)
 * inline the revisions — while still type-checking against the 24.x pin.
 * Where puppeteer-core >=25 is installed the real declaration wins.
 */
declare module "puppeteer-core/lib/puppeteer/revisions.js" {
  export const PUPPETEER_REVISIONS: { chrome: string };
}
