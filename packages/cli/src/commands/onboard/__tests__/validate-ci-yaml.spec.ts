import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findInvalidCiYaml, warnAboutInvalidCiYaml } from "../validate-ci-yaml";

const roots: string[] = [];

const makeRepo = (files: Record<string, string>): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "onboard-ci-yaml-")));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  return root;
};

const VALID_WORKFLOW = `name: Meticulous
on:
  pull_request:
jobs:
  meticulous:
    runs-on: ubuntu-latest
    steps:
      - uses: alwaysmeticulous/report-diffs-action/cloud-compute@v1
`;

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("findInvalidCiYaml", () => {
  it("accepts a valid Meticulous workflow", () => {
    const root = makeRepo({
      ".github/workflows/meticulous.yml": VALID_WORKFLOW,
    });

    expect(findInvalidCiYaml({ projectRoot: root })).toEqual([]);
  });

  it("reports a duplicated key with its line", () => {
    const root = makeRepo({
      ".github/workflows/meticulous.yml": `${VALID_WORKFLOW}  meticulous:\n    runs-on: ubuntu-latest\n`,
    });

    const [invalid, ...rest] = findInvalidCiYaml({ projectRoot: root });
    expect(rest).toEqual([]);
    expect(invalid?.relativePath).toBe(
      join(".github", "workflows", "meticulous.yml"),
    );
    expect(invalid?.problem).toContain("Map keys must be unique");
    expect(invalid?.problem).toContain("line 9");
    // The parser's source excerpt is dropped, so this stays one printable line.
    expect(invalid?.problem).not.toContain("\n");
  });

  // The real failure this check was added for: GitHub Actions rejected a
  // generated workflow because a `run:` command carried an unquoted `: `.
  it("catches a run command whose shell string contains a colon", () => {
    const root = makeRepo({
      ".github/workflows/meticulous-hub3.yml": `${VALID_WORKFLOW}      - name: Configure Yarn node linker\n        run: echo 'nodeLinker: node-modules' > .yarnrc.yml\n`,
    });

    const [invalid] = findInvalidCiYaml({ projectRoot: root });
    expect(invalid?.problem).toContain(
      "Nested mappings are not allowed in compact mappings",
    );
  });

  it("accepts the same command written as a block scalar", () => {
    const root = makeRepo({
      ".github/workflows/meticulous-hub3.yml": `${VALID_WORKFLOW}      - name: Configure Yarn node linker\n        run: |\n          echo 'nodeLinker: node-modules' > .yarnrc.yml\n`,
    });

    expect(findInvalidCiYaml({ projectRoot: root })).toEqual([]);
  });

  it("checks GitLab and Bitbucket pipeline files too", () => {
    const root = makeRepo({
      ".gitlab-ci.yml": "meticulous:\n\tscript: npx meticulous\n",
      "bitbucket-pipelines.yml":
        "pipelines:\n  default:\n  - step: {script: [npx meticulous}\n",
    });

    expect(
      findInvalidCiYaml({ projectRoot: root }).map((file) => file.relativePath),
    ).toEqual([".gitlab-ci.yml", "bitbucket-pipelines.yml"]);
  });

  it("ignores broken CI files that have nothing to do with Meticulous", () => {
    const root = makeRepo({
      ".github/workflows/tests.yml": "jobs:\n\ttest: broken\n",
      ".github/workflows/meticulous.yml": VALID_WORKFLOW,
    });

    expect(findInvalidCiYaml({ projectRoot: root })).toEqual([]);
  });

  it("ignores files that are not YAML and repos with no CI at all", () => {
    const root = makeRepo({
      ".github/workflows/README.md": "meticulous: [",
      "package.json": "{}",
    });

    expect(findInvalidCiYaml({ projectRoot: root })).toEqual([]);
  });
});

describe("warnAboutInvalidCiYaml", () => {
  it("names each broken file and stays silent otherwise", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const brokenRoot = makeRepo({
      ".github/workflows/meticulous.yml": "jobs:\n\tmeticulous: broken\n",
    });

    warnAboutInvalidCiYaml({ projectRoot: brokenRoot });
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain(join(".github", "workflows", "meticulous.yml"));
    expect(output).toContain("Fix these before merging");

    log.mockClear();
    warnAboutInvalidCiYaml({
      projectRoot: makeRepo({
        ".github/workflows/meticulous.yml": VALID_WORKFLOW,
      }),
    });
    expect(log).not.toHaveBeenCalled();
  });
});
