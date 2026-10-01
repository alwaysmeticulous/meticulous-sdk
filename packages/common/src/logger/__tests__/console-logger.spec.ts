import { afterEach, describe, expect, it, vi } from "vitest";
import { initLogger, routeLogsToStderr, setLogLevel } from "../console-logger";

describe("routeLogsToStderr", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps info logs off stdout at an explicit info level", () => {
    const stdout = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "warn").mockImplementation(() => {});

    routeLogsToStderr();
    setLogLevel("info");
    initLogger().info("Uploaded part 1");

    expect(stdout).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Uploaded part 1");
  });
});
