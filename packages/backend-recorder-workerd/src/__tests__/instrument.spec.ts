import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parse } from "acorn";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instrumentModule } from "../vite/instrument";

/**
 * The instrumenter rewrites a customer's build output, so two properties matter
 * above all: what it emits must parse, and a hit must be credited to the sink
 * that was current when the line ran (not the one current when the enclosing
 * closure was created). Both are checked by actually executing the output.
 */

const RUNTIME_MODULE = `
export let current;
export const setSink = (sink) => { current = sink; };
export const __mcEnter = () => current;
export const __mcHit = (id) => { if (current) { current[id] = 1; } };
`;

let scratchDir: string;

beforeAll(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "met-instrument-"));
  fs.writeFileSync(
    path.join(scratchDir, "runtime.mjs"),
    RUNTIME_MODULE,
    "utf-8",
  );
});

afterAll(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

const instrument = (
  code: string,
  firstId = 0,
  resolveOriginalLine?: (line: number, column: number) => number | null,
) =>
  instrumentModule({
    code,
    fileName: "src/app.ts",
    firstId,
    runtimeModuleId: "./runtime.mjs",
    ...(resolveOriginalLine === undefined ? {} : { resolveOriginalLine }),
  });

const expectParses = (code: string): void => {
  expect(() =>
    parse(code, { ecmaVersion: "latest", sourceType: "module" }),
  ).not.toThrow();
};

let moduleCounter = 0;

/** Writes the instrumented module beside the stub runtime and imports it. */
const loadInstrumented = async (
  code: string,
): Promise<{
  module: Record<string, unknown>;
  runtime: {
    setSink: (sink: Uint8Array | undefined) => void;
  };
  lineRanges: Array<[number, number]>;
  hitLines: (sink: Uint8Array) => number[];
}> => {
  const result = instrument(code);
  expect(result).not.toBeNull();
  expectParses(result!.code);

  const name = `mod-${moduleCounter++}.mjs`;
  fs.writeFileSync(path.join(scratchDir, name), result!.code, "utf-8");
  const module = (await import(path.join(scratchDir, name))) as Record<
    string,
    unknown
  >;
  const runtime = (await import(path.join(scratchDir, "runtime.mjs"))) as {
    setSink: (sink: Uint8Array | undefined) => void;
  };

  const hitLines = (sink: Uint8Array): number[] => {
    const lines = new Set<number>();
    result!.lineRanges.forEach(([start, end], index) => {
      if (sink[index]) {
        for (let line = start; line <= end; line++) {
          lines.add(line);
        }
      }
    });
    return [...lines].sort((a, b) => a - b);
  };

  return { module, runtime, lineRanges: result!.lineRanges, hitLines };
};

describe("instrumentModule", () => {
  it("records only the lines that actually executed", async () => {
    const { module, runtime, hitLines } = await loadInstrumented(`
export function pick(flag) {
  if (flag) {
    return "yes";
  } else {
    return "no";
  }
}
`);
    const sink = new Uint8Array(64);
    runtime.setSink(sink);
    expect((module.pick as (f: boolean) => string)(true)).toBe("yes");
    runtime.setSink(undefined);

    const lines = hitLines(sink);
    // The `if` and the taken branch, never the else branch.
    expect(lines).toContain(3);
    expect(lines).toContain(4);
    expect(lines).not.toContain(6);
  });

  it("credits a closure's lines to the sink current when it RUNS, not when it was created", async () => {
    const { module, runtime, hitLines } = await loadInstrumented(`
export function build() {
  const inner = () => {
    const marker = 1;
    return marker;
  };
  return inner;
}
`);
    const creating = new Uint8Array(64);
    const calling = new Uint8Array(64);

    runtime.setSink(creating);
    const inner = (module.build as () => () => number)();
    runtime.setSink(calling);
    expect(inner()).toBe(1);
    runtime.setSink(undefined);

    // Line 4 is inside the closure, so it belongs to the calling sink only.
    expect(hitLines(calling)).toContain(4);
    expect(hitLines(creating)).not.toContain(4);
  });

  it("instruments concise arrow bodies", async () => {
    const { module, runtime, hitLines } = await loadInstrumented(`
export const double = (n) => n * 2;
export const triple = (n) => n * 3;
`);
    const sink = new Uint8Array(64);
    runtime.setSink(sink);
    expect((module.double as (n: number) => number)(21)).toBe(42);
    runtime.setSink(undefined);

    const lines = hitLines(sink);
    expect(lines).toContain(2);
    expect(lines).not.toContain(3);
  });

  it("handles a derived constructor without observing this before super()", async () => {
    const { module, runtime } = await loadInstrumented(`
class Base {
  constructor() {
    this.tag = "base";
  }
}
export class Derived extends Base {
  constructor() {
    super();
    this.extra = 1;
  }
}
`);
    const sink = new Uint8Array(64);
    runtime.setSink(sink);
    const instance = new (module.Derived as new () => {
      tag: string;
      extra: number;
    })();
    runtime.setSink(undefined);
    expect(instance.tag).toBe("base");
    expect(instance.extra).toBe(1);
  });

  it("instruments switch cases", async () => {
    const { module, runtime, hitLines } = await loadInstrumented(`
export function route(kind) {
  switch (kind) {
    case "a":
      return 1;
    case "b":
      return 2;
    default:
      return 0;
  }
}
`);
    const sink = new Uint8Array(64);
    runtime.setSink(sink);
    expect((module.route as (k: string) => number)("b")).toBe(2);
    runtime.setSink(undefined);

    const lines = hitLines(sink);
    expect(lines).toContain(7);
    expect(lines).not.toContain(5);
  });

  it("leaves braceless single statements alone rather than mangling them", async () => {
    const { module, runtime } = await loadInstrumented(`
export function guard(value) {
  if (!value) return "empty";
  for (let i = 0; i < 1; i++) value = value + "!";
  return value;
}
`);
    const sink = new Uint8Array(64);
    runtime.setSink(sink);
    const guard = module.guard as (v: string) => string;
    expect(guard("")).toBe("empty");
    expect(guard("hi")).toBe("hi!");
    runtime.setSink(undefined);
  });

  it("is a no-op when there is no sink, so an uninstrumented request still works", async () => {
    const { module, runtime } = await loadInstrumented(`
export const compute = (n) => {
  const doubled = n * 2;
  return doubled;
};
`);
    runtime.setSink(undefined);
    expect((module.compute as (n: number) => number)(4)).toBe(8);
  });

  it("assigns ids from firstId so files can share one global id space", () => {
    const first = instrument(
      `export function a() { const x = 1; return x; }`,
      0,
    );
    const second = instrument(
      `export function b() { const y = 2; return y; }`,
      first!.lineRanges.length,
    );
    expect(first!.lineRanges.length).toBeGreaterThan(0);
    expect(second!.code).toContain(`[${first!.lineRanges.length}]`);
  });

  it("skips module-level statements, which run outside any request", () => {
    const result = instrument(`
const config = { a: 1 };
export default config;
`);
    // Nothing inside a function, so nothing to instrument at all.
    expect(result).toBeNull();
  });

  it("returns null rather than throwing on source it cannot parse", () => {
    expect(instrument(`const x: number = 1;`)).toBeNull();
    expect(instrument(`this is not javascript {{{`)).toBeNull();
  });

  it("emits a source map referencing the original file", () => {
    const result = instrument(`export function a() { const x = 1; return x; }`);
    expect(result!.map).toContain("src/app.ts");
  });
});

/**
 * The instrumenter runs after the build has re-printed the module, so an AST line
 * is not a line in the file the customer wrote. These cover the translation back.
 */
describe("original-line resolution", () => {
  const APP = `
export function handler(flag) {
  if (flag) {
    return 1;
  }
  return 0;
}
`;

  it("records resolved lines rather than lines in the code it was given", () => {
    const shiftedByTen = (line: number) => line + 10;
    const result = instrument(APP, 0, shiftedByTen);

    const asGiven = instrument(APP)!.lineRanges;
    expect(result!.lineRanges).toEqual(
      asGiven.map(([start, end]) => [start + 10, end + 10]),
    );
    expect(result!.droppedMarkers).toBe(0);
  });

  it("drops a marker whose position has no original line, and still emits valid code", () => {
    const onlyFirstLineMaps = (line: number) => (line <= 3 ? line : null);
    const result = instrument(APP, 0, onlyFirstLineMaps);

    expect(result!.droppedMarkers).toBeGreaterThan(0);
    expect(result!.lineRanges.length).toBeLessThan(
      instrument(APP)!.lineRanges.length,
    );
    expectParses(result!.code);
  });

  it("leaves no gap in the id space when a marker is dropped", () => {
    const dropSecond = (() => {
      let calls = 0;
      return (line: number) => (++calls === 3 ? null : line);
    })();
    const result = instrument(APP, 100, dropSecond);

    // Ids stay dense from firstId, so a dropped marker costs a line and nothing
    // else — the sidecar resolves ids by offset into the lineRanges array.
    const assignedIds = [...result!.code.matchAll(/__mcS\$\[(\d+)\]/g)].map(
      (match) => Number(match[1]),
    );
    expect(assignedIds).toEqual([100, 101]);
    expect(result!.lineRanges.length).toBe(
      instrument(APP)!.lineRanges.length - 1,
    );
    expectParses(result!.code);
  });

  it("returns null when nothing could be resolved at all", () => {
    expect(instrument(APP, 0, () => null)).toBeNull();
  });

  it("collapses a range whose end resolves at or before its start", () => {
    const multiLine = `
export function handler(items) {
  return compute(
    items,
    2,
  );
}
`;
    const endBeforeStart = (line: number) => (line >= 4 ? 1 : line);
    const result = instrument(multiLine, 0, endBeforeStart);

    for (const [start, end] of result!.lineRanges) {
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });
});
