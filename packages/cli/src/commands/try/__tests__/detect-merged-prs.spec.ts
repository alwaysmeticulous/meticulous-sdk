import { describe, expect, it } from "vitest";
import { detectMergedPr } from "../candidate-prs/detect-merged-prs";
import { commit, sha } from "./candidate-prs.fixtures";

describe("detectMergedPr", () => {
  it("reads a GitHub merge commit, taking the title from the body", () => {
    const merge = commit({
      parents: [sha("base"), sha("branch")],
      subject: "Merge pull request #42 from acme/feature-x",
      body: "Add the new pricing table\n\nLonger description",
    });
    expect(detectMergedPr(merge)).toMatchObject({
      prNumber: 42,
      kind: "merge",
      title: "Add the new pricing table",
      baseSha: sha("base"),
      headSha: merge.sha,
    });
  });

  it("reads a squash merge with a (#N) suffix", () => {
    const squash = commit({
      parents: [sha("base")],
      subject: "Redesign navbar (#77)",
    });
    expect(detectMergedPr(squash)).toMatchObject({
      prNumber: 77,
      kind: "squash",
      title: "Redesign navbar",
      baseSha: sha("base"),
      headSha: squash.sha,
    });
  });

  it("reads a GitLab merge commit and skips the trailer when taking the title", () => {
    const merge = commit({
      parents: [sha("base"), sha("branch")],
      subject: "Merge branch 'feat' into 'main'",
      body: "Checkout coupons\n\nSee merge request group/web!315",
    });
    expect(detectMergedPr(merge)).toMatchObject({
      prNumber: 315,
      kind: "merge",
      title: "Checkout coupons",
    });
  });

  it("reads a GitLab squash commit", () => {
    const squash = commit({
      subject: "Checkout coupons",
      body: "See merge request group/web!316",
    });
    expect(detectMergedPr(squash)).toMatchObject({
      prNumber: 316,
      kind: "squash",
      title: "Checkout coupons",
    });
  });

  it("reads a Bitbucket merge commit", () => {
    const merge = commit({
      parents: [sha("base"), sha("branch")],
      subject: "Merged in feature/login (pull request #9)",
      body: "Login page polish",
    });
    expect(detectMergedPr(merge)).toMatchObject({
      prNumber: 9,
      title: "Login page polish",
    });
  });

  it("ignores branch-sync merges, direct pushes and root commits", () => {
    expect(
      detectMergedPr(
        commit({
          parents: [sha("a"), sha("b")],
          subject: "Merge branch 'main' into feature",
        }),
      ),
    ).toBeNull();
    expect(detectMergedPr(commit({ subject: "fix typo" }))).toBeNull();
    expect(
      detectMergedPr(commit({ parents: [], subject: "init (#1)" })),
    ).toBeNull();
  });

  it("does not treat a (#N) suffix on a true merge commit as a squash", () => {
    expect(
      detectMergedPr(
        commit({ parents: [sha("a"), sha("b")], subject: "Merge stuff (#5)" }),
      ),
    ).toBeNull();
  });
});
