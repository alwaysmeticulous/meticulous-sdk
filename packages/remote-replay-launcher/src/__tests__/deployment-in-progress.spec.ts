import { describe, expect, it } from "vitest";
import { isDeploymentStillInProgress } from "../deployment-in-progress";

const withStatus = (status: number): unknown => ({ response: { status } });

const undiciError = (code: string): unknown => {
  const error = new TypeError("fetch failed");
  (error as TypeError & { cause?: unknown }).cause = { code };
  return error;
};

describe("isDeploymentStillInProgress", () => {
  it.each([429, 500, 502, 503, 504])(
    "treats a %i as still in progress",
    (status) => {
      expect(isDeploymentStillInProgress(withStatus(status))).toBe(true);
    },
  );

  it("treats a severed connection as still in progress", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isDeploymentStillInProgress(abort)).toBe(true);
    expect(isDeploymentStillInProgress(undiciError("UND_ERR_SOCKET"))).toBe(
      true,
    );
  });

  it("does not treat a 400 as still in progress", () => {
    expect(isDeploymentStillInProgress(withStatus(400))).toBe(false);
  });

  it("does not treat an ordinary error as still in progress", () => {
    expect(
      isDeploymentStillInProgress(new Error("Test run was not created")),
    ).toBe(false);
  });
});
