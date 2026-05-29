import {
  INITIAL_METICULOUS_RECORD_DOCS_URL,
  INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
  METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
} from "../constants";

/**
 * The recorder must not run in every frame. In particular:
 *
 * - PollyJS has top-level (outside-function) code that executes as soon as the script is
 *   loaded. Running it in `about:blank`, `chrome-error://`, or other non-web frames causes
 *   Chrome to hang or show an "Aw Snap" crash. These are blocked via FORBIDDEN_PROTOCOLS.
 * - Sentry and PollyJS each create hidden iframes as part of their initialization. If the
 *   recorder runs inside a sandboxed iframe (`sandbox` attribute without `allow-same-origin`,
 *   giving `window.origin === "null"`), those nested iframes appear blank and the recorder
 *   cannot function correctly anyway. These are blocked via the `window.origin !== 'null'` check.
 *
 * This isn't ideal, but unfortunately there's not a way to run page.evaluateOnNewDocument
 * conditionally (we could listen for frames being attached, and then inject the script,
 * though this has some complexities).
 */
export const wrapInShouldRecordCondition = (recorderCode: string) =>
  wrapScriptWhenDocumentElementExists(
    wrapScriptInCondition(recorderCode, constructShouldRecordCondition()),
  );

const constructShouldRecordCondition = () => {
  // We don't record on the built in start pages
  const FORBIDDEN_URLS = [
    INITIAL_METICULOUS_RECORD_DOCS_URL,
    INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
    METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
  ];

  /**
   * The recorder crashes if it tries to initialize on a chrome-error page
   * (Chrome e.g. uses this page for HTTP basic auth popups before the user has authenticated)
   * because the recorder tries inserting an iframe into the head, which crashes Chrome on that page.
   *
   * `about:` covers `about:blank` frames, which browsers use as the initial state of iframes before
   * their real URL loads — running PollyJS there causes the page to hang.
   */
  const FORBIDDEN_PROTOCOLS = ["chrome://", "chrome-error://", "about:"];

  const shouldRecordFrame =
    // Skip sandboxed iframes without allow-same-origin: their origin is "null" and the
    // recorder's Sentry/PollyJS iframes would appear blank and non-functional inside them.
    `window.origin !== 'null'` +
    ` && !${JSON.stringify(
      FORBIDDEN_URLS,
    )}.includes(window.document.location.toString())` +
    ` && !${JSON.stringify(
      FORBIDDEN_PROTOCOLS,
    )}.some((protocol) => window.document.location.toString().startsWith(protocol))`;

  return shouldRecordFrame;
};

/**
 * `evaluateOnNewDocument` runs before the HTML parser creates `<html>`, so
 * `document.documentElement` can still be null when the recorder bundle executes.
 * Iframe auto-install observes `document.documentElement` at init time and throws
 * if it is missing. Defer recorder startup until the root element exists.
 */
const wrapScriptWhenDocumentElementExists = (scriptContents: string) => {
  const lines = scriptContents.split("\n");
  const { nonEmptyLines, trailingEmptyLines } =
    splitOutTrailingEmptyLines(lines);
  const initialLines = nonEmptyLines.slice(0, -1);
  const lastNonEmptyLine = nonEmptyLines[nonEmptyLines.length - 1];
  const hasSourceMapComment = lastNonEmptyLine?.startsWith("//#");

  const recorderBody = hasSourceMapComment
    ? initialLines
    : [...initialLines, lastNonEmptyLine];

  const deferredWrapper = [
    "(function() {",
    "  var __meticulousRunRecorder = function() {",
    ...recorderBody,
    "  };",
    "  if (document.documentElement) {",
    "    __meticulousRunRecorder();",
    "  } else {",
    '    document.addEventListener("DOMContentLoaded", __meticulousRunRecorder, { once: true });',
    "  }",
    "})();",
  ];

  if (hasSourceMapComment) {
    return [...deferredWrapper, lastNonEmptyLine, ...trailingEmptyLines].join(
      "\n",
    );
  }

  return [...deferredWrapper, ...trailingEmptyLines].join("\n");
};

/**
 * Wraps the script in a condition while preserving the
 * source map comment at the end of the file if it exists.
 */
const wrapScriptInCondition = (scriptContents: string, condition: string) => {
  const lines = scriptContents.split("\n");
  const { nonEmptyLines, trailingEmptyLines } =
    splitOutTrailingEmptyLines(lines);
  const initialLines = nonEmptyLines.slice(0, -1);
  const lastNonEmptyLine = nonEmptyLines[nonEmptyLines.length - 1];

  if (lastNonEmptyLine?.startsWith("//#")) {
    // This is the source map comment, we want to keep it at the end
    return [
      `if (${condition}) {`,
      ...initialLines,
      `}`,
      lastNonEmptyLine,
      ...trailingEmptyLines,
    ].join("\n");
  } else {
    return [
      `if (${condition}) {`,
      ...initialLines,
      lastNonEmptyLine,
      `}`,
      ...trailingEmptyLines,
    ].join("\n");
  }
};

const splitOutTrailingEmptyLines = (lines: string[]) => {
  const trailingEmptyLines: string[] = [];
  const nonEmptyLines: string[] = [];

  [...lines.reverse()].forEach((line) => {
    if (line.trim() === "" && nonEmptyLines.length === 0) {
      trailingEmptyLines.push(line);
    } else {
      nonEmptyLines.push(line);
    }
  });

  return {
    nonEmptyLines: nonEmptyLines.reverse(),
    trailingEmptyLines: trailingEmptyLines.reverse(),
  };
};
