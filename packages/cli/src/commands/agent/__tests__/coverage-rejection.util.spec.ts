import { describe, expect, it } from "vitest";
import { withBaseRunRejectionAsUserError } from "../coverage-rejection.util";

const fetchErrorWith = (data: Record<string, unknown>): Error =>
  Object.assign(new Error("Request failed"), {
    response: { status: 409, data },
  });

describe("withBaseRunRejectionAsUserError", () => {
  // The project-scoped routes have no clientVersion to negotiate the
  // processing response over, so they still answer an unfinished run with a
  // 409 — which is a state the backend named, not a fault to report.
  it("relays a run-not-complete 409 as a user error", async () => {
    const message =
      "Test run tr-1 is still Running; its coverage will be available once the run has finished. Poll again then.";
    await expect(
      withBaseRunRejectionAsUserError(() =>
        Promise.reject(
          fetchErrorWith({
            statusCode: 409,
            error: "Conflict",
            reason: "run-not-complete",
            message,
          }),
        ),
      ),
    ).rejects.toThrow(message);
  });

  it("leaves an unrecognised failure on the generic error path", async () => {
    const error = fetchErrorWith({
      statusCode: 404,
      message: "JS coverage artifact not found",
    });
    await expect(
      withBaseRunRejectionAsUserError(() => Promise.reject(error)),
    ).rejects.toBe(error);
  });
});
