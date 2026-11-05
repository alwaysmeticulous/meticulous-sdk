import { describe, expect, it } from "vitest";
import {
  FIELD_SEPARATOR,
  HEADER_END,
  RECORD_SEPARATOR,
  parseGitLog,
  resolveRenamedPath,
} from "../candidate-prs/parse-git-log";

const record = (fields: string[], numstat: string): string =>
  `${RECORD_SEPARATOR}${fields.join(FIELD_SEPARATOR)}${HEADER_END}\n${numstat}`;

describe("parseGitLog", () => {
  it("parses headers, multi-line bodies and numstat lines", () => {
    const raw =
      record(
        [
          "aaa",
          "p1 p2",
          "1700000000",
          "Ada",
          "Merge pull request #12 from x/y",
          "Add button\n\nMore details",
        ],
        "10\t2\tsrc/Button.tsx\n-\t-\tassets/logo.png\n",
      ) +
      record(
        ["bbb", "p3", "1700000100", "Bob", "Fix (#13)", ""],
        "1\t1\tsrc/a.ts\n",
      );

    const commits = parseGitLog(raw);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: "aaa",
      parents: ["p1", "p2"],
      committedAt: 1700000000,
      author: "Ada",
      subject: "Merge pull request #12 from x/y",
      body: "Add button\n\nMore details",
      files: [
        { path: "src/Button.tsx", added: 10, deleted: 2 },
        { path: "assets/logo.png", added: 0, deleted: 0 },
      ],
    });
    expect(commits[1].parents).toEqual(["p3"]);
  });

  it("keeps a body containing the field separator intact", () => {
    const [parsed] = parseGitLog(
      record(["aaa", "p1", "1", "A", "s", `one${FIELD_SEPARATOR}two`], ""),
    );
    expect(parsed.body).toBe(`one${FIELD_SEPARATOR}two`);
  });

  it("skips malformed records and handles root commits", () => {
    const raw =
      `${RECORD_SEPARATOR}garbage` +
      record(["r", "", "1", "A", "init", ""], "");
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual([]);
  });
});

describe("resolveRenamedPath", () => {
  it.each([
    ["src/{old => new}/a.ts", "src/new/a.ts"],
    ["src/{ => nested}/a.ts", "src/nested/a.ts"],
    ["old.ts => new.ts", "new.ts"],
    ["plain/path.tsx", "plain/path.tsx"],
  ])("%s -> %s", (input, expected) => {
    expect(resolveRenamedPath(input)).toBe(expected);
  });
});
