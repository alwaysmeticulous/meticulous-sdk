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

describe("makeRequest caller abort signal", () => {
  beforeEach(() => {
    meticulousFetch.mockReset();
  });

  it("is passed through to fetch so the request can be aborted in flight", async () => {
    const controller = new AbortController();
    meticulousFetch.mockImplementation(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const promise = request({ signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow("Aborted");
  });

  it("does not re-attempt a request the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    meticulousFetch.mockRejectedValue(severedConnection());

    await expect(request({ signal: controller.signal })).rejects.toThrow(
      "fetch failed",
    );

    expect(meticulousFetch).toHaveBeenCalledTimes(1);
  });

  it("does not re-attempt when the caller aborts mid-retry-schedule", async () => {
    const controller = new AbortController();
    meticulousFetch.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          reject(severedConnection());
        }),
    );

    const promise = request({
      signal: controller.signal,
      retry: { maxRetries: 3 },
    });
    controller.abort();
    await expect(promise).rejects.toThrow("fetch failed");

    expect(meticulousFetch).toHaveBeenCalledTimes(1);
  });
});
