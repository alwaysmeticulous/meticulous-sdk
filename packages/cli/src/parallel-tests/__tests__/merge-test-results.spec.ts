import { mergeResults } from "../merge-test-results";
import {
  diff,
  differentSize,
  flake,
  missingBase,
  missingBaseAndHead,
  missingHead,
  noDiff,
  testResult,
} from "./mock-test-results";

describe("mergeResults", () => {
  it("keeps the result as a failure when all retried screenshots are 'identical'", () => {
    const currentResult = testResult("fail", [diff(0), noDiff(1)]);
    const comparisonToHeadReplay = testResult("pass", [noDiff(0), noDiff(1)]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(testResult("fail", [diff(0), noDiff(1)]));
  });

  it("doesn't ignore diffs to screenshots which originally passed", () => {
    const currentResult = testResult("pass", [noDiff(0), noDiff(1)]);
    const comparisonToHeadReplay = testResult("fail", [noDiff(0), diff(1)]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(
      testResult("fail", [noDiff(0), flake(1, noDiff(), [diff()])])
    );
  });

  it("marks screenshots as flakes if the screenshot comparison originally failed, but the second retry gives a different screenshot again", () => {
    const currentResult = testResult("fail", [noDiff(0), diff(1), diff(2)]);
    const comparisonToHeadReplay = testResult("fail", [
      noDiff(0),
      diff(1),
      noDiff(2),
    ]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(
      testResult("fail", [noDiff(0), flake(1, diff(), [diff()]), diff(2)])
    );
  });

  it("marks overall test as a flake if there are only flakey screenshots and no failed screenshots", () => {
    const currentResult = testResult("fail", [noDiff(0), diff(1), diff(2)]);
    const comparisonToHeadReplay = testResult("fail", [
      noDiff(0),
      diff(1),
      diff(2),
    ]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(
      testResult("flake", [
        noDiff(0),
        flake(1, diff(), [diff()]),
        flake(2, diff(), [diff()]),
      ])
    );
  });

  it("adds to diffsToHeadScreenshotOnRetries for existing flakes", () => {
    const currentResult = testResult("fail", [
      diff(0),
      flake(1, diff(), [missingHead()]),
      flake(2, differentSize(), [diff()]),
      flake(3, missingBase(), [diff(), diff()]),
    ]);
    const comparisonToHeadReplay = testResult("fail", [
      noDiff(0),
      diff(1),
      differentSize(2),
      missingHead(3),
    ]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(
      testResult("fail", [
        diff(0),
        flake(1, diff(), [missingHead(), diff()]),
        flake(2, differentSize(), [diff(), differentSize()]),
        flake(3, missingBase(), [diff(), diff(), missingHead()]),
      ])
    );
  });

  it("keeps a missing-head as is, if there is no corresponding retry screenshot", () => {
    const currentResult = testResult("fail", [missingHead(0)]);
    const comparisonToHeadReplay = testResult("pass", []);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(testResult("fail", [missingHead(0)]));
  });

  it("adds to diffsToHeadScreenshotOnRetries for a flakey missing-head, if there is no corresponding retry screenshot", () => {
    const currentResult = testResult("fail", [
      flake(0, missingHead(), [missingBase()]),
      diff(1),
    ]);
    const comparisonToHeadReplay = testResult("pass", [noDiff(1)]);
    const mergedResult = mergeResults({
      currentResult,
      comparisonToHeadReplay,
    });
    expect(mergedResult).toEqual(
      testResult("fail", [
        flake(0, missingHead(), [missingBase(), missingBaseAndHead()]),
        diff(1),
      ])
    );
  });
});
