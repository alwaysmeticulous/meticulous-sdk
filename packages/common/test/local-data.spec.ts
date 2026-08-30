import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importLocalData = () => import("../src/local-data/local-data");

describe("getMeticulousLocalDataDir", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // The resolved dir is memoized in a module-level variable, so each case
    // needs a fresh copy of the module.
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.METICULOUS_DIR;
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    process.env.HOME = path.join(path.sep, "home", "someone");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to $HOME/.meticulous", async () => {
    const { getMeticulousLocalDataDir } = await importLocalData();

    expect(getMeticulousLocalDataDir()).toBe(
      path.join(path.sep, "home", "someone", ".meticulous"),
    );
  });

  it("defaults to a dir under os.tmpdir() on Vercel", async () => {
    process.env.VERCEL = "1";

    const { getMeticulousLocalDataDir } = await importLocalData();

    expect(getMeticulousLocalDataDir()).toBe(
      path.join(os.tmpdir(), ".meticulous"),
    );
  });

  it("defaults to a dir under os.tmpdir() on AWS Lambda", async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "my-function";

    const { getMeticulousLocalDataDir } = await importLocalData();

    expect(getMeticulousLocalDataDir()).toBe(
      path.join(os.tmpdir(), ".meticulous"),
    );
  });

  it("prefers METICULOUS_DIR over the serverless default", async () => {
    process.env.VERCEL = "1";
    process.env.METICULOUS_DIR = path.join(path.sep, "explicit", "dir");

    const { getMeticulousLocalDataDir } = await importLocalData();

    expect(getMeticulousLocalDataDir()).toBe(
      path.join(path.sep, "explicit", "dir"),
    );
  });

  it("prefers an explicitly set dir over the serverless default", async () => {
    process.env.VERCEL = "1";

    const { getMeticulousLocalDataDir, setMeticulousLocalDataDir } =
      await importLocalData();
    setMeticulousLocalDataDir(path.join(path.sep, "explicit", "dir"));

    expect(getMeticulousLocalDataDir()).toBe(
      path.join(path.sep, "explicit", "dir"),
    );
  });
});
