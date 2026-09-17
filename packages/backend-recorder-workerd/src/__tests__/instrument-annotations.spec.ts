import * as vm from "vm";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";
import { instrumentModule } from "../vite/instrument";
import { MetTraceMap } from "../vite/met-workerd-trace-mapping";

/**
 * The instrumenter runs after the build's own JSX pass, whose output annotates
 * every `jsx(...)` call with `/* @__PURE__ *\/`. A marker inserted between an
 * annotation and its call leaves the annotation on the marker, which a bundler
 * reports as `INVALID_ANNOTATION` and then ignores — so these check the
 * bundler's own verdict rather than the shape of the emitted text.
 *
 * Rollup stands in for every bundler here: the same fixtures were verified
 * against rolldown 1.2.5, which produces an identical warning for an identical
 * input.
 */

const RUNTIME_ID = "virtual:met-coverage-runtime";

const RUNTIME_SOURCE = `
export const __mcEnter = () => globalThis.__metSink;
export const __mcHit = (id) => { if (globalThis.__metSink) { globalThis.__metSink[id] = 1; } };
`;

const instrument = (code: string) =>
  instrumentModule({
    code,
    fileName: "src/app.tsx",
    firstId: 0,
    runtimeModuleId: RUNTIME_ID,
  });

/** Bundles an instrumented module, reporting what the bundler made of it. */
const bundleInstrumented = async (
  source: string,
): Promise<{ warnings: string[]; bundled: string }> => {
  const instrumented = instrument(source);
  expect(instrumented).not.toBeNull();

  const warnings: string[] = [];
  const build = await rollup({
    input: "virtual:entry",
    onwarn: (warning) => warnings.push(warning.code ?? "UNKNOWN"),
    plugins: [
      {
        name: "virtual-modules",
        resolveId: (id) =>
          id === "virtual:entry" || id === RUNTIME_ID ? id : null,
        load: (id) => {
          if (id === "virtual:entry") {
            return instrumented!.code;
          }
          return id === RUNTIME_ID ? RUNTIME_SOURCE : null;
        },
      },
    ],
  });
  const { output } = await build.generate({ format: "cjs", exports: "named" });
  await build.close();
  return { warnings, bundled: output[0].code };
};

const expectNoAnnotationWarnings = async (source: string): Promise<void> => {
  const { warnings } = await bundleInstrumented(source);
  expect(warnings).not.toContain("INVALID_ANNOTATION");
};

describe("build annotations", () => {
  it("leaves a concise arrow body's annotation on the call it was written for", async () => {
    await expectNoAnnotationWarnings(`
function jsx(type, props) { return { type, props }; }
export const Link = (props) => /* @__PURE__ */ jsx("a", { href: props.href });
`);
  });

  it.each([
    ["hash-prefixed", `export const a = () => /*#__PURE__*/ mk();`],
    ["new expression", `export const b = () => /* @__PURE__ */ new Map();`],
    ["parenthesised body", `export const c = () => (/* @__PURE__ */ mk());`],
    [
      "annotation outside the parens",
      `export const d = () => /* @__PURE__ */ (mk());`,
    ],
    ["async arrow", `export const e = async () => /* @__PURE__ */ mk();`],
    [
      "nested arrow",
      `export const f = (xs) => xs.map((x) => /* @__PURE__ */ mk(x));`,
    ],
    [
      "comment terminator inside a string",
      `export const g = () => /* @__PURE__ */ mk("*/");`,
    ],
  ])("keeps the annotation attached: %s", async (_name, body) => {
    await expectNoAnnotationWarnings(`
function mk(x) { return x; }
${body}
`);
  });

  it("leaves a marked statement's annotation on the call it was written for", async () => {
    await expectNoAnnotationWarnings(`
export function boot() {
  /* @__PURE__ */ register();
  return 1;
}
function register() { globalThis.registered = true; }
`);
  });

  it("keeps the annotation on a statement introduced by a line comment", async () => {
    await expectNoAnnotationWarnings(`
export function boot() {
  //#__PURE__
  register();
  return 1;
}
function register() { globalThis.registered = true; }
`);
  });

  it("still records coverage once the bundler has taken its pass", async () => {
    const { bundled } = await bundleInstrumented(`
function jsx(type, props) { return { type, props }; }
export const Link = (props) => /* @__PURE__ */ jsx("a", { href: props.href });
export function boot() {
  /* @__PURE__ */ register();
  return Link({ href: "/" });
}
function register() { globalThis.registered = true; }
`);

    const sandbox: {
      __metSink: number[];
      exports: { boot?: () => unknown };
    } = { __metSink: [], exports: {} };
    vm.runInNewContext(bundled, sandbox);
    expect(typeof sandbox.exports.boot).toBe("function");
    expect(sandbox.exports.boot!()).toEqual({
      type: "a",
      props: { href: "/" },
    });

    // Both marker shapes survived the bundler: the statements' sink stores and
    // the arrow body's `__mcHit`.
    expect(
      sandbox.__metSink.filter((hit) => hit === 1).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("stays parseable when an annotated statement follows one that ended by ASI", async () => {
    // The annotation's comment run starts on the previous statement's line, so
    // the insertion point moves back onto that line, where the missing
    // semicolon is the only thing separating the two statements.
    await expectNoAnnotationWarnings(`
export function boot() {
  const a = 1 /* first */
  /* @__PURE__ */ register()
  return a
}
function register() { globalThis.registered = true; }
`);
  });

  it("attributes the annotated call to the line it was written on", () => {
    const source = `import { jsx } from "./jsx-runtime";
const unrelated = 1;
export const Link = (props) => /* @__PURE__ */ jsx("a", { href: props.href });
`;
    const instrumented = instrument(source)!;
    const map = new MetTraceMap(
      JSON.parse(instrumented.map) as { mappings: string; sources: string[] },
    );

    const lines = instrumented.code.split("\n");
    const generatedLine =
      lines.findIndex((line) => line.includes('jsx("a"')) + 1;
    const generatedColumn = lines[generatedLine - 1].indexOf('jsx("a"');

    expect(map.originalPositionFor(generatedLine, generatedColumn)?.line).toBe(
      3,
    );
  });

  it("marks the arrow body against the line the body is on", () => {
    const instrumented = instrument(`const a = 1;
const b = 2;
export const Link = (props) => /* @__PURE__ */ jsx("a", props);
`)!;
    expect(instrumented.lineRanges).toEqual([[3, 3]]);
  });
});
