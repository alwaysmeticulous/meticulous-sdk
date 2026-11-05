const MAX_TEXT_LENGTH = 30;
const MAX_ATTR_LENGTH = 40;
const MAX_SELECTOR_TAIL_LENGTH = 60;
const SUMMARY_ATTRIBUTES = [
  "data-testid",
  "data-test-id",
  "aria-label",
  "role",
  "name",
  "type",
  "placeholder",
];
/** Event flag, DOM `key` value and display label of each modifier. */
const MODIFIER_KEYS: ReadonlyArray<[string, string, string]> = [
  ["ctrlKey", "Control", "Ctrl"],
  ["metaKey", "Meta", "Meta"],
  ["altKey", "Alt", "Alt"],
  ["shiftKey", "Shift", "Shift"],
];

interface PathElement {
  tagName?: string;
  id?: string;
  attrs?: Record<string, string>;
  href?: string;
  isShadowRoot?: boolean;
  truncatedInnerText?: string;
  firstTextContained?: { text?: string };
  label?: {
    truncatedInnerText?: string;
    firstTextContained?: { text?: string };
  };
}

/**
 * One replayed user event as a single line: its type (and key, for keyboard
 * events), the result, how confidently its target was matched, why it failed,
 * and the element it was replayed on, e.g.
 * `click result=success conf=0.93 target=button[aria-label=Save] "Save"` or
 * `pointerdown result=failed reason=no-match-obscured target=div#menu`.
 */
export const formatSimulatedUserEvent = (
  data: Record<string, unknown>,
): string => {
  const userEvent = asRecord(data.userEvent);
  const matchQuality = asRecord(data.matchQuality);
  const result = typeof data.result === "string" ? data.result : "?";
  const parts = [typeof userEvent.type === "string" ? userEvent.type : "?"];

  const key = formatKey(userEvent);
  if (key != null) {
    parts.push(`key=${key}`);
  }
  parts.push(`result=${result}`);
  if (typeof matchQuality.confidence === "number") {
    parts.push(`conf=${matchQuality.confidence.toFixed(2)}`);
  }
  if (result === "failed" && typeof matchQuality.type === "string") {
    parts.push(`reason=${matchQuality.type}`);
  }

  // A failed event never reached an element, so name the recorded target.
  const target =
    describeTarget(
      result === "failed"
        ? userEvent.nodeIdentifier
        : (matchQuality.nodeIdentifier ?? userEvent.nodeIdentifier),
    ) ?? describeSelectorTail(userEvent.selector);
  if (target != null) {
    parts.push(`target=${target}`);
  }
  return parts.join(" ");
};

const formatKey = (userEvent: Record<string, unknown>): string | undefined => {
  if (typeof userEvent.key !== "string") {
    return undefined;
  }
  const { key } = userEvent;
  const modifiers = MODIFIER_KEYS.filter(
    ([field, domKey]) => userEvent[field] === true || key === domKey,
  ).map(([, , label]) => label);
  const isModifierKey = MODIFIER_KEYS.some(([, domKey]) => key === domKey);
  return [
    ...modifiers,
    ...(isModifierKey ? [] : [key === " " ? "Space" : key]),
  ].join("+");
};

const describeTarget = (identifier: unknown): string | undefined => {
  const { type, path } = asRecord(identifier);
  if (typeof type !== "string") {
    return undefined;
  }
  if (type !== "path" || !Array.isArray(path)) {
    return type;
  }
  const leaf = path[path.length - 1] as PathElement | undefined;
  return leaf != null ? formatPathElement(leaf) : undefined;
};

/**
 * `button#save[aria-label=Save] "Save"`. Class names are left out: they are
 * often generated, so they churn between builds and would only add noise.
 */
const formatPathElement = (element: PathElement): string => {
  if (element.isShadowRoot) {
    return "#shadow-root";
  }
  const parts = [element.tagName?.toLowerCase() ?? "?"];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  for (const name of SUMMARY_ATTRIBUTES) {
    const value = element.attrs?.[name];
    if (value != null) {
      parts.push(`[${name}=${truncate(value, MAX_ATTR_LENGTH)}]`);
    }
  }
  if (element.href != null) {
    parts.push(`[href=${truncate(element.href, MAX_ATTR_LENGTH)}]`);
  }
  const text = getElementText(element);
  if (text != null) {
    parts.push(` "${truncate(text, MAX_TEXT_LENGTH)}"`);
  }
  return parts.join("");
};

const getElementText = (element: PathElement): string | undefined => {
  const text = (
    element.truncatedInnerText ??
    element.label?.truncatedInnerText ??
    element.firstTextContained?.text ??
    element.label?.firstTextContained?.text
  )
    ?.replace(/\s+/g, " ")
    .trim();
  return text ? text : undefined;
};

const describeSelectorTail = (selector: unknown): string | undefined =>
  typeof selector === "string" && selector.length > 0
    ? truncateStart(selector, MAX_SELECTOR_TAIL_LENGTH)
    : undefined;

const asRecord = (value: unknown): Record<string, unknown> =>
  value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const truncate = (s: string, maxLen: number): string =>
  s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;

const truncateStart = (s: string, maxLen: number): string =>
  s.length > maxLen ? `...${s.slice(s.length - maxLen)}` : s;
