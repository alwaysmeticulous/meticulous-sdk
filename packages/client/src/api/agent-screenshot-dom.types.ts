/** The default page size of `getScreenshotDom` and `getScreenshotDomDiffText`, in lines. */
export const DEFAULT_SCREENSHOT_DOM_LIMIT = 100;

/** The largest page `getScreenshotDom` and `getScreenshotDomDiffText` accept, in lines. */
export const MAX_SCREENSHOT_DOM_LIMIT = 1000;

/** The longest line either returns; a longer one is cut short. */
export const MAX_SCREENSHOT_DOM_LINE_LENGTH = 2000;

/**
 * The longest attribute value, text or comment either returns; a longer one is
 * cut short.
 */
export const MAX_SCREENSHOT_DOM_VALUE_LENGTH = 1000;

/**
 * The `clientVersion` from which the screenshot DOM diff route answers with
 * {@link ScreenshotDomDiffTextResponse}, paged by line, rather than the whole
 * diff as a list of hunks (`ScreenshotDomDiffResponse`).
 */
export const SCREENSHOT_DOM_DIFF_TEXT_CLIENT_VERSION = 2;

export interface ScreenshotDomOptions {
  /**
   * The element to return, as an nth-child path from `<body>`: `[]` is
   * `<body>` itself, `[1, 0]` the first element child of its second element
   * child. Defaults to `<body>`.
   */
  path?: readonly number[];
  /**
   * Remove the noise `getScreenshotDomDiffText` removes from both sides
   * (generated ids and class names, Meticulous's `data-meticulous-*`
   * annotations, elements with no visual effect). Defaults to the DOM as
   * captured.
   */
  removeNoise?: boolean;
  /** Lines to return (1-{@link MAX_SCREENSHOT_DOM_LIMIT}). */
  limit?: number;
  /** Lines to skip before `limit`, for pagination. */
  offset?: number;
}

export interface ScreenshotDomResponse {
  /** The page of the selected element's outer HTML, pretty-printed. */
  dom: string;
  /** Caveats about the answer, such as the page range when there is more. */
  notes?: string[];
}

export interface ScreenshotDomDiffTextOptions {
  /** Lines of context around each hunk (default 3), or `"full"`. */
  context?: number | "full";
  /** Diff only this element, as {@link ScreenshotDomOptions.path}. */
  path?: readonly number[];
  /** Lines to return (1-{@link MAX_SCREENSHOT_DOM_LIMIT}). */
  limit?: number;
  /** Lines to skip before `limit`, for pagination. */
  offset?: number;
}

export interface ScreenshotDomDiffTextResponse {
  /**
   * The page of the diff's lines: each hunk headed by `diff <n> at path [...]`, naming the
   * changed element's path, then its lines, unified-diff style and indented.
   */
  diff: string;
  /** Caveats about the answer, such as the page range when there is more. */
  notes?: string[];
}
