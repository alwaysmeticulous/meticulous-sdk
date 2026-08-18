import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { inlineImportedDocConstants } from "../inline-doc-constants";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Writes a fake docs tree and returns the absolute path of the first file. */
const writeDocs = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-doc-inline-"));
  dirs.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return join(root, Object.keys(files)[0]);
};

const inline = (files: Record<string, string>): string => {
  const docPath = writeDocs(files);
  return inlineImportedDocConstants({
    source: files[Object.keys(files)[0]],
    docPath,
    webappRoot: join(dirname(docPath), "webapp"),
  });
};

describe("inlineImportedDocConstants", () => {
  it("inlines a constant imported from another doc module", () => {
    const result = inline({
      "guide.ts": [
        'import { linkGitLabInstructions } from "./how-to/link-gitlab";',
        "",
        "export const document = `# Guide",
        "${linkGitLabInstructions}",
        "`;",
        "",
      ].join("\n"),
      "how-to/link-gitlab.ts": [
        "export const linkGitLabInstructions = `1. Create a token",
        "2. Paste it into Meticulous`;",
        "",
      ].join("\n"),
    });

    expect(result).toContain("1. Create a token\n2. Paste it into Meticulous");
    expect(result).not.toContain("${linkGitLabInstructions}");
  });

  it("resolves constants referenced by the inlined value", () => {
    const result = inline({
      "guide.ts": [
        'import { steps } from "./steps";',
        "export const document = `${steps}`;",
        "",
      ].join("\n"),
      "steps.ts": [
        'import { ACTION } from "./constants";',
        "export const steps = `Run ${ACTION}@v1 in ${WHERE}`;",
        'const WHERE = "CI";',
        "",
      ].join("\n"),
      "constants.ts":
        'export const ACTION = "alwaysmeticulous/upload-assets";\n',
    });

    expect(result).toContain("Run alwaysmeticulous/upload-assets@v1 in CI");
  });

  it("resolves imports from the webapp root", () => {
    const result = inline({
      "guide.ts": [
        'import { SUPPORT_EMAIL } from "src/lib/next/next.constants";',
        "export const document = `Email ${SUPPORT_EMAIL}`;",
        "",
      ].join("\n"),
      "webapp/src/lib/next/next.constants.ts":
        'export const SUPPORT_EMAIL = "support@meticulous.ai";\n',
    });

    expect(result).toContain("Email support@meticulous.ai");
  });

  it("leaves constants defined in the same file for the agent to read", () => {
    const source = [
      "const workflow = `jobs: {}`;",
      "export const document = `${workflow}`;",
      "",
    ].join("\n");

    expect(inline({ "guide.ts": source })).toBe(source);
  });

  it("leaves references it cannot follow untouched", () => {
    const source = [
      'import { CHECK_NAME } from "@alwaysmeticulous/webapp-frontend-backend-shared";',
      "export const document = `${CHECK_NAME} and ${renderTable()}`;",
      "",
    ].join("\n");

    expect(inline({ "guide.ts": source })).toBe(source);
  });

  it("keeps escaped placeholders, which are examples rather than references", () => {
    const source = [
      'import { unused } from "./other";',
      "export const document = `image: node:\\${NODE_VERSION}-alpine`;",
      "",
    ].join("\n");

    const result = inline({
      "guide.ts": source,
      "other.ts": 'export const unused = "x";\n',
    });

    expect(result).toBe(source);
  });

  it("unescapes the inlined value so markdown reads as markdown", () => {
    const result = inline({
      "guide.ts": [
        'import { snippet } from "./snippet";',
        "export const document = `${snippet}`;",
        "",
      ].join("\n"),
      "snippet.ts":
        "export const snippet = `Use \\`meticulous simulate\\` next`;\n",
    });

    expect(result).toContain("Use `meticulous simulate` next");
  });

  it("follows renamed imports", () => {
    const result = inline({
      "guide.ts": [
        'import { steps as gitlabSteps } from "./steps";',
        "export const document = `${gitlabSteps}`;",
        "",
      ].join("\n"),
      "steps.ts": 'export const steps = "Link the project";\n',
    });

    expect(result).toContain("Link the project");
  });

  it("ignores import statements quoted inside code samples", () => {
    const source = [
      'import { title } from "./title";',
      "export const document = `${title}",
      "",
      "```ts",
      'import { steps } from "./steps";',
      "```",
      "",
      "${steps}`;",
      'const steps = "the value defined here";',
      "",
    ].join("\n");

    const result = inline({
      "guide.ts": source,
      "title.ts": 'export const title = "# Guide";\n',
      "steps.ts": 'export const steps = "the wrong value";\n',
    });

    expect(result).toContain("# Guide");
    expect(result).toContain("${steps}");
    expect(result).not.toContain("the wrong value");
  });
});
