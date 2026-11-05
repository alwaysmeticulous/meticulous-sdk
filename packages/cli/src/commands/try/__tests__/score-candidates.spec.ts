import { describe, expect, it } from "vitest";
import { isFrontendFile } from "../candidate-prs/classify-files";
import { detectBugSignals } from "../candidate-prs/detect-bug-signals";
import { detectMergedPrs } from "../candidate-prs/detect-merged-prs";
import { scoreCandidates } from "../candidate-prs/score-candidates";
import type { GitCommit } from "../candidate-prs/types";
import { DAY, NOW, commit, files } from "./candidate-prs.fixtures";

const score = (commits: GitCommit[], appPath = ".") =>
  scoreCandidates({
    prs: detectMergedPrs(commits),
    commits,
    appPath,
    nowSeconds: NOW,
  });

describe("isFrontendFile", () => {
  it.each([
    ["src/components/Button.tsx", ".", true],
    ["src/styles/main.scss", ".", true],
    ["apps/web/src/App.vue", "apps/web", true],
    ["apps/api/src/server.ts", "apps/web", false],
    ["src/Button.test.tsx", ".", false],
    ["src/__tests__/Button.tsx", ".", false],
    ["src/Button.stories.tsx", ".", false],
    ["e2e/login.ts", ".", false],
    ["vite.config.ts", ".", false],
    ["README.md", ".", false],
    ["src/types.d.ts", ".", false],
    ["server/routes.ts", ".", false],
  ])("%s (app %s) -> %s", (path, appPath, expected) => {
    expect(isFrontendFile(path, appPath)).toBe(expected);
  });
});

describe("detectBugSignals", () => {
  const pr = commit({
    subject: "Rework checkout form (#10)",
    daysAgo: 20,
    files: files("src/Checkout.tsx", "src/Coupon.tsx"),
  });
  const [merged] = detectMergedPrs([pr]);

  it("finds a git revert by sha", () => {
    const revert = commit({
      subject: 'Revert "Rework checkout form (#10)"',
      body: `This reverts commit ${pr.sha.slice(0, 10)}.`,
      daysAgo: 18,
    });
    const signals = detectBugSignals({
      pr: merged,
      frontendFiles: ["src/Checkout.tsx"],
      commits: [revert, pr],
    });
    expect(signals.revertedBy).toMatchObject({ sha: revert.sha, daysAfter: 2 });
  });

  it("finds a GitHub revert PR by title or reference", () => {
    const byTitle = commit({
      subject: 'Revert "Rework checkout form" (#11)',
      daysAgo: 19,
    });
    const byReference = commit({
      subject: "Undo checkout (#12)",
      body: "Reverts acme/web#10",
      daysAgo: 19,
    });
    for (const revert of [byTitle, byReference]) {
      expect(
        detectBugSignals({
          pr: merged,
          frontendFiles: [],
          commits: [revert, pr],
        }).revertedBy?.sha,
      ).toBe(revert.sha);
    }
  });

  it("does not count a revert of another PR or an earlier commit", () => {
    const other = commit({
      subject: 'Revert "Something else" (#13)',
      daysAgo: 19,
    });
    const earlier = commit({
      subject: "Reverts #10",
      body: "Reverts #10",
      daysAgo: 25,
    });
    expect(
      detectBugSignals({
        pr: merged,
        frontendFiles: [],
        commits: [other, pr, earlier],
      }).revertedBy,
    ).toBeNull();
  });

  it("finds follow-up fixes touching the same UI files within 14 days only", () => {
    const fix = commit({
      subject: "fix: coupon input loses focus (#14)",
      daysAgo: 17,
      files: files("src/Coupon.tsx"),
    });
    const unrelatedFix = commit({
      subject: "fix: header (#15)",
      daysAgo: 17,
      files: files("src/Header.tsx"),
    });
    const lateFix = commit({
      subject: "hotfix checkout (#16)",
      daysAgo: 2,
      files: files("src/Checkout.tsx"),
    });
    const feature = commit({
      subject: "Add coupon analytics (#17)",
      daysAgo: 16,
      files: files("src/Coupon.tsx"),
    });
    const signals = detectBugSignals({
      pr: merged,
      frontendFiles: ["src/Checkout.tsx", "src/Coupon.tsx"],
      commits: [lateFix, feature, unrelatedFix, fix, pr],
    });
    expect(signals.followUpFixes.map((related) => related.sha)).toEqual([
      fix.sha,
    ]);
  });
});

describe("scoreCandidates", () => {
  it("ranks a reverted PR above a fixed one above a plain one, and drops non-UI PRs", () => {
    const plain = commit({
      subject: "Add settings page (#1)",
      daysAgo: 40,
      files: files("src/Settings.tsx", "src/Form.tsx"),
    });
    const fixed = commit({
      subject: "New table component (#2)",
      daysAgo: 30,
      files: files("src/Table.tsx"),
    });
    const fix = commit({
      subject: "Fix table sorting (#3)",
      daysAgo: 28,
      files: files("src/Table.tsx"),
    });
    const reverted = commit({
      subject: "Swap date picker (#4)",
      daysAgo: 20,
      files: files("src/DatePicker.tsx"),
    });
    const revert = commit({
      subject: 'Revert "Swap date picker" (#5)',
      daysAgo: 19,
      files: files("src/DatePicker.tsx"),
    });
    const backendOnly = commit({
      subject: "Tune DB pool (#6)",
      daysAgo: 5,
      files: files("server/db.ts"),
    });
    const docs = commit({
      subject: "Docs (#7)",
      daysAgo: 5,
      files: files("docs/intro.md"),
    });

    const ranked = score([
      docs,
      backendOnly,
      revert,
      reverted,
      fix,
      fixed,
      plain,
    ]);
    const numbers = ranked.map((candidate) => candidate.prNumber);

    expect(numbers.slice(0, 2)).toEqual([4, 2]);
    expect(numbers).toContain(1);
    expect(numbers).not.toContain(5);
    expect(numbers).not.toContain(6);
    expect(numbers).not.toContain(7);
    expect(ranked[0].reasons[0]).toMatch(/^reverted 1d later/);
    expect(ranked[0]).toMatchObject({
      baseSha: reverted.parents[0],
      headSha: reverted.sha,
    });
  });

  it("scopes UI files to the app path in a monorepo", () => {
    const web = commit({
      subject: "Web tweak (#1)",
      files: files("apps/web/src/A.tsx"),
    });
    const admin = commit({
      subject: "Admin tweak (#2)",
      files: files("apps/admin/src/A.tsx"),
    });
    expect(
      score([web, admin], "apps/web").map((candidate) => candidate.prNumber),
    ).toEqual([1]);
  });

  it("prefers a meaningful change over a tiny or huge one", () => {
    const tiny = commit({
      subject: "Tweak (#1)",
      daysAgo: 50,
      files: files(["src/A.tsx", 1, 1]),
    });
    const medium = commit({
      subject: "Feature (#2)",
      daysAgo: 50,
      files: files(["src/B.tsx", 200, 50]),
    });
    const huge = commit({
      subject: "Giant (#3)",
      daysAgo: 50,
      files: files(["src/C.tsx", 6000, 10]),
    });
    expect(score([tiny, medium, huge])[0].prNumber).toBe(2);
  });

  it("flags refactors and dependency upgrades", () => {
    const refactor = commit({
      subject: "Refactor forms to the design system (#1)",
      files: files("src/A.tsx", "src/B.tsx", "src/C.tsx"),
    });
    const upgrade = commit({
      subject: "Bump react to 19 (#2)",
      files: files(["package.json", 2, 2], ["pnpm-lock.yaml", 300, 300]),
    });
    const [first, second] = score([refactor, upgrade]).sort(
      (a, b) => a.prNumber - b.prNumber,
    );
    expect(first.signals.refactor).toBe(true);
    expect(second.signals.dependencyUpgrade).toBe(true);
    expect(second.frontendFiles).toEqual([]);
  });

  it("breaks ties by recency", () => {
    const older = commit({
      subject: "A (#1)",
      daysAgo: 80,
      files: files("src/A.tsx"),
    });
    const newer = commit({
      subject: "B (#2)",
      daysAgo: 70,
      files: files("src/B.tsx"),
    });
    expect(
      score([newer, older]).map((candidate) => candidate.prNumber),
    ).toEqual([2, 1]);
    expect(DAY).toBeGreaterThan(0);
  });
});
