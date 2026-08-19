import { parse } from "acorn";
import MagicString from "magic-string";

/**
 * Inserts per-line coverage markers into an ES module.
 *
 * Coverage on workerd cannot come from V8: workerd's inspector echoes
 * `Profiler.enable` back instead of dispatching it, so `startPreciseCoverage` is
 * unreachable, and the one coverage API it does forward
 * (`getBestEffortCoverage`) has binary saturating counts that cannot be diffed
 * into per-request deltas. So the code reports on itself instead.
 *
 * Two marker shapes, and the distinction is a correctness requirement rather
 * than an optimisation:
 *
 *   - every function with a block body opens with `const S = __mcEnter()`, and
 *     each statement in that body (however deeply nested in plain blocks) marks
 *     itself against `S`. One AsyncLocalStorage lookup per invocation, then a
 *     bare array store per line.
 *   - a concise arrow body (`() => expr`) has no block to hold the preamble, so
 *     it calls `__mcHit(id)` and resolves the sink itself.
 *
 * Re-resolving the sink at *every* function boundary is what keeps attribution
 * honest. A closure that outlives the request that created it — stashed in a
 * module-level cache, handed to `waitUntil` — would otherwise keep writing into
 * the defining request's sink and credit its lines to the wrong session.
 *
 * Every construct this cannot safely instrument is skipped, never guessed at:
 * module-level statements (they run at isolate init, outside any request),
 * class static blocks, and single statements that are not part of a statement
 * list (`if (x) return;`). Skipping loses a line; guessing would emit invalid
 * syntax into a customer's build.
 *
 * Line numbers come from {@link InstrumentModuleOptions.resolveOriginalLine},
 * not from the AST directly. This runs after the build's own TypeScript/JSX
 * pass, which re-prints the module and drops comments and blank lines, so an
 * AST line is a line in that re-printed output rather than in the file the
 * customer wrote — off by however much was stripped above it. Resolving through
 * the transform chain's source map is what makes the reported line the one a
 * human can open. A position the map cannot resolve is dropped for the same
 * reason unparseable constructs are: losing a line beats reporting the wrong
 * one.
 */

/** Local name of the imported sink resolver. */
const ENTER = "__mcE$";
/** Local name of the imported single-expression hit reporter. */
const HIT = "__mcH$";
/** Per-invocation sink binding, redeclared (and shadowed) in every function. */
const SINK = "__mcS$";

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/** Node keys that never hold child nodes worth walking. */
const SKIPPED_KEYS = new Set(["type", "start", "end", "loc", "range"]);

interface AstNode {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: unknown;
}

export interface InstrumentedModule {
  code: string;
  /** Source map for the inserted markers, as a JSON string. */
  map: string;
  /**
   * Inclusive 1-based `[startLine, endLine]` per assigned id, in id order. The
   * id of `lineRanges[i]` is `firstId + i`.
   *
   * Lines are positions in the *original* source, resolved through
   * {@link InstrumentModuleOptions.resolveOriginalLine}.
   */
  lineRanges: Array<[number, number]>;
  /** Markers dropped because their position had no line in the original source. */
  droppedMarkers: number;
}

/**
 * Resolves a position in the code being instrumented to its 1-based line in the
 * original source, or null when it has none.
 *
 * @param line 1-based line in the code passed to {@link instrumentModule}.
 * @param column 0-based column on that line.
 */
export type OriginalLineResolver = (
  line: number,
  column: number,
) => number | null;

export interface InstrumentModuleOptions {
  code: string;
  fileName: string;
  firstId: number;
  runtimeModuleId: string;
  /**
   * Defaults to the identity, which is only correct for a module that reached
   * the plugin untransformed. The Vite plugin always passes a real resolver.
   */
  resolveOriginalLine?: OriginalLineResolver;
}

/**
 * Returns the instrumented module, or null when there was nothing to
 * instrument or the source could not be parsed. A parse failure is deliberately
 * not an error: this runs inside a customer's build, and coverage is never
 * worth breaking it for.
 */
export const instrumentModule = ({
  code,
  fileName,
  firstId,
  runtimeModuleId,
  resolveOriginalLine = (line) => line,
}: InstrumentModuleOptions): InstrumentedModule | null => {
  let program: AstNode;
  try {
    program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      allowHashBang: true,
    }) as unknown as AstNode;
  } catch {
    return null;
  }

  const magic = new MagicString(code);
  const lineRanges: Array<[number, number]> = [];
  let droppedMarkers = 0;

  /** The id to mark this node with, or null when its line cannot be resolved. */
  const nextId = (node: AstNode): number | null => {
    const range = ownLineRange(node, resolveOriginalLine);
    if (range === null) {
      droppedMarkers++;
      return null;
    }
    lineRanges.push(range);
    return firstId + lineRanges.length - 1;
  };

  const markStatement = (node: AstNode): void => {
    const id = nextId(node);
    if (id === null) {
      return;
    }
    magic.appendLeft(node.start, `${SINK}&&(${SINK}[${id}]=1);`);
  };

  const openFunctionBody = (body: AstNode): void => {
    // Immediately after the `{`, so a derived constructor's `super()` stays the
    // first *effective* statement and nothing observes `this` before it.
    magic.appendLeft(body.start + 1, `const ${SINK}=${ENTER}();`);
  };

  const markConciseArrowBody = (body: AstNode): void => {
    const id = nextId(body);
    if (id === null) {
      return;
    }
    magic.appendLeft(body.start, `(${HIT}(${id}),`);
    magic.appendRight(body.end, ")");
  };

  visitProgram(program, {
    markStatement,
    openFunctionBody,
    markConciseArrowBody,
  });

  if (lineRanges.length === 0) {
    return null;
  }

  magic.prepend(
    `import {__mcEnter as ${ENTER},__mcHit as ${HIT}} from ${JSON.stringify(runtimeModuleId)};\n`,
  );

  return {
    code: magic.toString(),
    map: magic.generateMap({ source: fileName, hires: true }).toString(),
    lineRanges,
    droppedMarkers,
  };
};

interface Visitors {
  markStatement: (node: AstNode) => void;
  openFunctionBody: (body: AstNode) => void;
  markConciseArrowBody: (body: AstNode) => void;
}

const visitProgram = (program: AstNode, visitors: Visitors): void => {
  for (const child of childNodes(program)) {
    visit(child, program, false, visitors);
  }
};

/**
 * @param insideFunction whether an enclosing function has already emitted a
 * {@link SINK} binding that statements here can legally reference.
 */
const visit = (
  node: AstNode,
  parent: AstNode,
  insideFunction: boolean,
  visitors: Visitors,
): void => {
  if (node.type === "StaticBlock") {
    // Runs at class evaluation, outside any request. Descend for nested
    // functions but never mark its own statements.
    descend(node, false, visitors);
    return;
  }

  if (FUNCTION_TYPES.has(node.type)) {
    visitFunction(node, visitors);
    return;
  }

  if (
    insideFunction &&
    isInStatementList(parent) &&
    isMarkableStatement(node)
  ) {
    visitors.markStatement(node);
  }

  descend(node, insideFunction, visitors);
};

const visitFunction = (node: AstNode, visitors: Visitors): void => {
  const body = node.body;
  if (isAstNode(body) && body.type === "BlockStatement") {
    visitors.openFunctionBody(body);
    descend(node, true, visitors);
    return;
  }
  // Concise arrow body: an expression, so there is nowhere to hoist a binding.
  if (isAstNode(body)) {
    visitors.markConciseArrowBody(body);
  }
  descend(node, false, visitors);
};

const descend = (
  node: AstNode,
  insideFunction: boolean,
  visitors: Visitors,
): void => {
  for (const child of childNodes(node)) {
    visit(child, node, insideFunction, visitors);
  }
};

const childNodes = (node: AstNode): AstNode[] => {
  const children: AstNode[] = [];
  for (const key of Object.keys(node)) {
    if (SKIPPED_KEYS.has(key)) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          children.push(item);
        }
      }
    } else if (isAstNode(value)) {
      children.push(value);
    }
  }
  return children;
};

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

/**
 * The original-source lines a node occupies *itself*, excluding anything it
 * merely encloses, or null when its start has no original position.
 *
 * A multi-line call really does execute every line it spans, so its full range
 * is right. But `if (flag) {` spans its whole else branch, and
 * `const f = () => {` spans a body that runs later (possibly in another
 * request) — crediting those spans would report untaken branches as covered.
 * Nested statements and function bodies carry their own markers, so collapsing
 * an enclosing statement to its first line loses nothing.
 *
 * Both endpoints are resolved before the enclosing-scope test, because the range
 * that matters is the one in the original source: the build's transform can put
 * several original lines on one generated line, and can only be trusted to have
 * preserved order, not distance. An end that resolves to at or before the start
 * collapses to the start rather than inverting the range.
 */
const ownLineRange = (
  node: AstNode,
  resolveOriginalLine: OriginalLineResolver,
): [number, number] | null => {
  const startLine = node.loc?.start.line ?? 1;
  const startColumn = node.loc?.start.column ?? 0;
  const start = resolveOriginalLine(startLine, startColumn);
  if (start === null) {
    return null;
  }
  const end = resolveOriginalLine(
    node.loc?.end.line ?? startLine,
    node.loc?.end.column ?? startColumn,
  );
  if (end === null || end <= start) {
    return [start, start];
  }
  return enclosesOwnScope(node) ? [start, start] : [start, end];
};

/** Whether any descendant is a nested statement or function body. */
const enclosesOwnScope = (node: AstNode): boolean =>
  childNodes(node).some(
    (child) =>
      FUNCTION_TYPES.has(child.type) ||
      child.type === "StaticBlock" ||
      child.type.endsWith("Statement") ||
      child.type === "SwitchCase" ||
      child.type === "CatchClause" ||
      enclosesOwnScope(child),
  );

/**
 * Whether a marker statement can be inserted before this node's siblings. A
 * statement list is the only safe insertion point — prefixing the lone body of
 * `if (x) doThing();` would rebind the `if`.
 */
const isInStatementList = (parent: AstNode): boolean =>
  parent.type === "BlockStatement" ||
  parent.type === "SwitchCase" ||
  parent.type === "Program";

const NON_MARKABLE_STATEMENTS = new Set([
  "EmptyStatement",
  // Hoisted or link-time; a marker before them would report them as executed
  // at a line the runtime never reaches in order.
  "FunctionDeclaration",
  "ImportDeclaration",
  "ExportAllDeclaration",
  "ExportDefaultDeclaration",
  "ExportNamedDeclaration",
]);

const isMarkableStatement = (node: AstNode): boolean =>
  node.type.endsWith("Statement") || node.type.endsWith("Declaration")
    ? !NON_MARKABLE_STATEMENTS.has(node.type)
    : false;
