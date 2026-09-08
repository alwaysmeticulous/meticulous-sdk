import { describe, expect, it } from "vitest";
import {
  locateImportRules,
  parseStyleRules,
} from "../css-sourcemap-import-locate";

describe("parseStyleRules", () => {
  it("records selectors and their 0-based source lines", () => {
    const css = "/* banner */\n.card-title {\n  color: red;\n}\n";
    expect(parseStyleRules(css)).toEqual([
      { selector: ".card-title", line: 1 },
    ]);
  });

  it("walks into wrapper at-rules and skips statements", () => {
    const css = `@import "./other.css";
@media (min-width: 768px) {
  .hero-banner {
    display: none;
  }
}
`;
    expect(parseStyleRules(css)).toEqual([
      { selector: ".hero-banner", line: 2 },
    ]);
  });
});

describe("locateImportRules", () => {
  it("maps a generated rule to the import file and selector line", () => {
    const imported = ".card-title {\n  color: navy;\n}\n";
    const generated =
      ".utility{display:flex}\n.card-title {\n  color: navy;\n}\n";
    expect(
      locateImportRules(generated, [
        { absolutePath: "/repo/src/cards.css", content: imported },
      ]),
    ).toEqual([
      {
        absolutePath: "/repo/src/cards.css",
        content: imported,
        originalLine: 0,
        startLine: 1,
        endLine: 3,
      },
    ]);
  });

  it("matches a multiline selector after Lightning collapses it", () => {
    const imported =
      ".arrow-icon .btn-arrow,\n.arrow-icon .btn-arrow-hover {\n  transition: transform 0.3s;\n}\n";
    const generated =
      ".arrow-icon .btn-arrow, .arrow-icon .btn-arrow-hover {\n  transition: transform 0.3s;\n}\n";
    const [hit] = locateImportRules(generated, [
      { absolutePath: "/repo/src/interactions.css", content: imported },
    ]);
    expect(hit).toMatchObject({
      absolutePath: "/repo/src/interactions.css",
      originalLine: 0,
      startLine: 0,
      endLine: 2,
    });
  });

  it("gives the same selector in two files to successive unclaimed matches", () => {
    const webflow = ".w-nav-overlay {\n  z-index: 1;\n}\n";
    const interactions = ".w-nav-overlay {\n  z-index: 2;\n}\n";
    const generated =
      ".w-nav-overlay {\n  z-index: 1;\n}\n.w-nav-overlay {\n  z-index: 2;\n}\n";
    const hits = locateImportRules(generated, [
      { absolutePath: "/repo/src/webflow.css", content: webflow },
      { absolutePath: "/repo/src/interactions.css", content: interactions },
    ]);
    expect(hits).toEqual([
      {
        absolutePath: "/repo/src/webflow.css",
        content: webflow,
        originalLine: 0,
        startLine: 0,
        endLine: 2,
      },
      {
        absolutePath: "/repo/src/interactions.css",
        content: interactions,
        originalLine: 0,
        startLine: 3,
        endLine: 5,
      },
    ]);
  });

  it("maps repeated selectors in one file in source order", () => {
    const imported =
      ".w-container {\n  width: 100%;\n}\n@media (max-width: 750px) {\n  .w-container {\n    width: auto;\n  }\n}\n";
    const generated =
      ".w-container {\n  width: 100%;\n}\n@media (max-width: 750px) {\n  .w-container {\n    width: auto;\n  }\n}\n";
    const hits = locateImportRules(generated, [
      { absolutePath: "/repo/src/webflow.css", content: imported },
    ]);
    expect(hits.map((hit) => [hit.originalLine, hit.startLine])).toEqual([
      [0, 0],
      [4, 4],
    ]);
  });

  it("does not claim a prefix of a longer class name", () => {
    const imported = ".card-title {\n  color: navy;\n}\n";
    const generated = ".card-title-large {\n  color: red;\n}\n";
    expect(
      locateImportRules(generated, [
        { absolutePath: "/repo/src/cards.css", content: imported },
      ]),
    ).toEqual([]);
  });

  it("does not treat a selector mentioned in a comment as a rule", () => {
    const imported = ".hero-banner {\n  display: none;\n}\n";
    const generated =
      "/* .hero-banner { } */\n.utility-box {\n  display: flex;\n}\n";
    expect(
      locateImportRules(generated, [
        { absolutePath: "/repo/src/hero.css", content: imported },
      ]),
    ).toEqual([]);
  });

  it("does not claim short selectors that look like utilities", () => {
    const imported = ".flex {\n  display: flex;\n}\n";
    const generated = ".flex {\n  display: flex;\n}\n";
    expect(
      locateImportRules(generated, [
        { absolutePath: "/repo/src/utilities.css", content: imported },
      ]),
    ).toEqual([]);
  });
});
