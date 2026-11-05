import { createHash } from "crypto";
import type { FileChange, GitCommit } from "../candidate-prs/types";

export const DAY = 86_400;
export const NOW = 1_800_000_000;

let counter = 0;

export const sha = (label: string): string =>
  createHash("sha1").update(label).digest("hex");

export const files = (
  ...paths: Array<string | [string, number, number]>
): FileChange[] =>
  paths.map((entry) =>
    typeof entry === "string"
      ? { path: entry, added: 40, deleted: 10 }
      : { path: entry[0], added: entry[1], deleted: entry[2] },
  );

export const commit = (
  overrides: Partial<GitCommit> & { daysAgo?: number },
): GitCommit => {
  counter += 1;
  const { daysAgo = 10, ...rest } = overrides;
  return {
    sha: sha(`c${counter}`),
    parents: [sha(`p${counter}`)],
    committedAt: NOW - daysAgo * DAY,
    author: "Dev",
    subject: "chore: something",
    body: "",
    files: [],
    ...rest,
  };
};
