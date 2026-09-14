import type * as Common from "@alwaysmeticulous/common";
import log from "loglevel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest } from "../client";

const meticulousFetch = vi.fn();

vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  meticulousFetch: (...args: unknown[]) => meticulousFetch(...args),
}));

const severedConnection = (): Error => {
  const error = new TypeError("fetch failed");
  (error as TypeError & { cause?: unknown }).cause = { code: "UND_ERR_SOCKET" };
  return error;
};

const request = (config: Parameters<typeof makeRequest>[0]["config"]) =>
  makeRequest({
    url: "project-deployments/complete-asset-upload-and-maybe-trigger-run",
    headers: {},
    options: { method: "POST" },
    config,
    logger: log,
  });

describe("makeRequest retry override", () => {
  beforeEach(() => {
    meticulousFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes exactly one attempt when retries are disabled", async () => {
    meticulousFetch.mockRejectedValue(severedConnection());

    await expect(request({ retry: false })).rejects.toThrow("fetch failed");
    expect(meticulousFetch).toHaveBeenCalledTimes(1);
  });

  it("honours a caller-supplied schedule", async () => {
    meticulousFetch.mockRejectedValue(severedConnection());

    const promise = request({ retry: { maxRetries: 1 } });
    const assertion = expect(promise).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    expect(meticulousFetch).toHaveBeenCalledTimes(2);
  });
});
