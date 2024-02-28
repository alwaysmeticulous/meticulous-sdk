import {
  INITIAL_METICULOUS_RECORD_DOCS_URL,
  INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
  METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
} from "../constants";

/**
 * PollyJS seems to have some logic that is outside of a function body, and so executed
 * as soon as the script is loaded. This causes Aw Snap errors in Chrome when the script
 * is injected too early inside certain iFrames. To avoid this we wrap the script in a condition to
 * prevent it executing at all in certain contexts.
 *
 * This isn't ideal, but unfortunately there's not a way to run page.evaluateOnNewDocument conditionally
 * (we could listen for frames being attached, and then inject the script, though this has
 * some complexities)
 */
export const wrapInShouldRecordCondition = (recorderCode: string) =>
  wrapScriptInCondition(recorderCode, constructShouldRecordCondition());

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
   *
   * This is because the recorder tries inserting an iframe into the head, and this crashes Chrome
   * if done on a chrome-error page.
   */
  const FORBIDDEN_PROTOCOLS = ["chrome://", "chrome-error://"];

  const shouldRecordFrame =
    // We only record in the root frame (not in sub-iframes)
    `window === window.parent` +
    ` && !${JSON.stringify(
      FORBIDDEN_URLS
    )}.includes(window.document.location.toString())` +
    ` && !${JSON.stringify(
      FORBIDDEN_PROTOCOLS
    )}.some((protocol) => window.document.location.toString().startsWith(protocol))`;

  return shouldRecordFrame;
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
