import { describe, expect, it } from "vitest";
import {
  addContextToHunks,
  computeCanonicalHunks,
  computeFullContextDiff,
  formatDomForDiff,
  formatHunkLines,
} from "../format";

describe("formatDomForDiff", () => {
  it("pretty-prints HTML and strips indentation", () => {
    const dom = "<div><span>hi</span></div>";
    const formatted = formatDomForDiff(dom);
    const lines = formatted.split("\n").map((l) => l);
    expect(lines.every((l) => !/^\s/.test(l))).toBe(true);
    expect(formatted).toContain("<div>");
    expect(formatted).toContain("<span>hi</span>");
    expect(formatted).toContain("</div>");
  });

  it("produces multi-line output for nested tags", () => {
    // Shape assertion only; exact per-tag line breaks are
    // js-beautify-version-dependent and must be pinned by the ported
    // backend byte-compat suite, not here.
    const dom = "<div><p>hi</p></div>";
    const formatted = formatDomForDiff(dom);
    const lines = formatted.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines).toContain("<div>");
    expect(lines).toContain("</div>");
  });

  it("is idempotent: formatting the output again is a no-op", () => {
    const dom = "<div><span>a</span><span>b</span></div>";
    const once = formatDomForDiff(dom);
    const twice = formatDomForDiff(once);
    expect(twice).toBe(once);
  });
});

describe("computeCanonicalHunks", () => {
  it("returns [] for identical inputs", () => {
    const dom = "<div>hello</div>";
    const formatted = formatDomForDiff(dom);
    expect(computeCanonicalHunks(formatted, formatted)).toEqual([]);
  });

  it("returns one hunk per atomic change (context: 0)", () => {
    const base = formatDomForDiff("<div><p>a</p><p>b</p><p>c</p></div>");
    const head = formatDomForDiff("<div><p>A</p><p>b</p><p>C</p></div>");
    const hunks = computeCanonicalHunks(base, head);
    expect(hunks.length).toBeGreaterThanOrEqual(2);
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        // context: 0 means every line is a change line
        expect(line[0] === "+" || line[0] === "-").toBe(true);
      }
    }
  });
});

describe("addContextToHunks", () => {
  it("returns [] when given no hunks", () => {
    expect(addContextToHunks([], "", "", 3)).toEqual([]);
  });

  it("pads each hunk with up to `contextLines` surrounding lines without merging adjacent hunks", () => {
    const base = formatDomForDiff(
      "<div><p>a</p><p>b</p><p>c</p><p>d</p><p>e</p></div>",
    );
    const head = formatDomForDiff(
      "<div><p>A</p><p>b</p><p>c</p><p>d</p><p>E</p></div>",
    );
    const canonical = computeCanonicalHunks(base, head);
    expect(canonical.length).toBeGreaterThanOrEqual(2);

    const padded = addContextToHunks(canonical, base, head, 3);
    expect(padded.length).toBe(canonical.length);
    for (let i = 0; i < padded.length; i++) {
      expect(padded[i].oldLines).toBeGreaterThanOrEqual(canonical[i].oldLines);
      expect(padded[i].newLines).toBeGreaterThanOrEqual(canonical[i].newLines);
    }
  });

  it("clamps to the available lines at the start of file", () => {
    const base = formatDomForDiff("<div><p>a</p><p>b</p></div>");
    const head = formatDomForDiff("<div><p>A</p><p>b</p></div>");
    const hunks = computeCanonicalHunks(base, head);
    const padded = addContextToHunks(hunks, base, head, 100);
    for (const hunk of padded) {
      expect(hunk.oldStart).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("computeFullContextDiff", () => {
  it("emits every line of identical input as space-prefixed context", () => {
    const dom = "<div>only</div>";
    const formatted = formatDomForDiff(dom);
    const full = computeFullContextDiff(formatted, formatted);
    expect(full).not.toContain("@@");
    expect(full).not.toMatch(/^---/m);
    expect(full).not.toMatch(/^\+\+\+/m);
    const body = full.split("\n").filter((l) => l.length > 0);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((l) => l.startsWith(" "))).toBe(true);
  });

  it("contains both + and - lines for real diffs", () => {
    const base = formatDomForDiff("<p>hello</p>");
    const head = formatDomForDiff("<p>world</p>");
    const full = computeFullContextDiff(base, head);
    expect(full).toMatch(/^-/m);
    expect(full).toMatch(/^\+/m);
  });
});

describe("formatHunkLines", () => {
  it("joins hunk lines with newlines", () => {
    const base = formatDomForDiff("<div><p>a</p></div>");
    const head = formatDomForDiff("<div><p>b</p></div>");
    const [hunk] = computeCanonicalHunks(base, head);
    const body = formatHunkLines(hunk);
    expect(body.split("\n")).toEqual(hunk.lines);
  });
});
