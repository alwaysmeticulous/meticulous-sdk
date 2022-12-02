export const BASE_SNIPPETS_URL = "https://snippet.meticulous.ai/";

// Many comments directly from Chromium source
// https://source.chromium.org/chromium/chromium/src/+/main:content/public/common/content_switches.cc
export const COMMON_CHROMIUM_FLAGS = [
  // WebFontsCacheAwareTimeoutAdaption - font request interception caching might trigger
  // a double requestPaused CDP event which triggers "request" Puppeteer event to be emitted twice
  // which breaks tracking of in-flight requests. See https://bugs.chromium.org/p/chromium/issues/detail?id=1196004 and
  // https://github.com/puppeteer/puppeteer/issues/7475.
  "--disable-features=Translate,WebFontsCacheAwareTimeoutAdaption",
  // Disable task throttling of timer tasks from background pages.
  "--disable-background-timer-throttling",
  // Prevent renderer process backgrounding when set.
  "--disable-renderer-backgrounding",
  // Disable backgrounding renders for occluded windows. Done for tests to avoid
  // nondeterministic behavior.
  "--disable-backgrounding-occluded-windows",
  // Disables crash reporting. ↪
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  // Disables installation of default apps on first run, e.g. gmail
  "--disable-default-apps",
  // The /dev/shm partition is too small in certain VM environments, causing
  // Chrome to fail or crash (see http://crbug.com/715363). Use this flag to
  // work-around this issue (a temporary directory will always be used to create
  // anonymous shared memory files).
  "--disable-dev-shm-usage",
  "--disable-extensions",
  // Suppresses hang monitor dialogs in renderer processes.
  // This may allow slow unload handlers on a page to prevent the tab from closing,
  // but the Task Manager can be used to terminate the offending process in this case.
  "--disable-hang-monitor",
  // Disables the IPC flooding protection.
  // It is activated by default. Some javascript functions can be used to flood
  // the browser process with IPC. This protection limits the rate at which they
  // can be used.
  "--disable-ipc-flooding-protection",
  // Disables the Web Notification and the Push APIs.
  "--disable-notifications",
  // Normally when the user attempts to navigate to a page that was the result of a post
  // we prompt to make sure they want to. This switch may be used to disable that check.
  "--disable-prompt-on-repost",
  "--disable-sync",
  // Skip First Run tasks, like importing history or bookmarks.
  // See https://www.chromium.org/developers/design-documents/first-run-customizations/
  "--no-first-run",
];
