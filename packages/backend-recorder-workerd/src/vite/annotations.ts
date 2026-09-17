/**
 * Keeps a build annotation attached to the node it was written for when the
 * instrumenter inserts code in front of that node.
 *
 * Bundlers read `/* @__PURE__ *\/` and its family off the comment immediately
 * preceding an expression. A marker inserted at the node's own start goes
 * *between* the two, leaving the annotation on the marker — a shape every
 * bundler reports as `INVALID_ANNOTATION` and then ignores, so a JSX-heavy
 * build both fills with warnings (esbuild's JSX transform annotates every
 * `jsx(...)` call, and the instrumenter runs after it) and silently loses the
 * hint. Opening the insertion before the annotation instead keeps it adjacent
 * to its own expression.
 *
 * Comment positions come from the parse rather than a backwards scan of the
 * text: `jsx("*\/", p)` puts a comment terminator inside a string literal, and
 * a scanner would read it as the end of a comment that never existed.
 */

/**
 * `@__PURE__`, `#__PURE__`, `@__NO_SIDE_EFFECTS__`, and whatever a bundler adds
 * next. Matching the family rather than a fixed list only risks moving an
 * insertion a few bytes earlier than it had to be, which is always valid.
 */
const ANNOTATION = /[@#]__[A-Z\d_]+__/;

/** Whitespace between a comment and what it annotates. */
const WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);

interface CommentRange {
  start: number;
  isAnnotation: boolean;
}

/**
 * Every lookup answers the same question — where does the annotation run
 * preceding this node begin? — and returns `start` itself when nothing
 * preceding it is an annotation, so a module without any is rewritten byte for
 * byte as before. The two methods differ only in whether the scan may cross an
 * opening parenthesis.
 */
export interface AnnotationIndex {
  /** Pass as acorn's `onComment` while parsing the same code. */
  record: (isBlock: boolean, text: string, start: number, end: number) => void;
  /**
   * For a marker inserted ahead of a statement. Stops at a `(`: a statement
   * marker that crossed one would land inside a grouping it never closes.
   */
  beforeStatement: (start: number) => number;
  /**
   * For a wrapper opened ahead of an expression and closed at its end. May
   * cross a `(`, because the close still lands inside it — the pair stays
   * balanced around whatever was crossed.
   */
  beforeWrappedExpression: (start: number) => number;
}

export const createAnnotationIndex = (code: string): AnnotationIndex => {
  const commentsByEnd = new Map<number, CommentRange>();

  const annotationRunStart = (start: number, crossOpenParens: boolean) => {
    let index = start;
    let earliest = start;
    let sawAnnotation = false;
    for (;;) {
      index = skipBackwards(code, index, crossOpenParens);
      const comment = commentsByEnd.get(index);
      if (comment === undefined) {
        break;
      }
      sawAnnotation = sawAnnotation || comment.isAnnotation;
      index = comment.start;
      earliest = comment.start;
    }
    return sawAnnotation ? earliest : start;
  };

  return {
    record: (_isBlock, text, start, end) => {
      commentsByEnd.set(end, { start, isAnnotation: ANNOTATION.test(text) });
    },
    beforeStatement: (start) => annotationRunStart(start, false),
    beforeWrappedExpression: (start) => annotationRunStart(start, true),
  };
};

const skipBackwards = (
  code: string,
  index: number,
  crossOpenParens: boolean,
): number => {
  let i = index;
  while (i > 0) {
    const char = code[i - 1];
    if (WHITESPACE.has(char) || (crossOpenParens && char === "(")) {
      i--;
      continue;
    }
    return i;
  }
  return i;
};
