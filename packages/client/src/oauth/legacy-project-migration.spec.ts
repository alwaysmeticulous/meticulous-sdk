import { beforeEach, describe, expect, it, vi } from "vitest";
import type log from "loglevel";
import { migrateLegacySelectedProjectIfPresent } from "./legacy-project-migration";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  getOAuthDefaultProject: vi.fn(),
  setOAuthDefaultProject: vi.fn(),
  buildClient: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  unlinkSync: mocks.unlinkSync,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  getMeticulousLocalDataDir: () => "/tmp/meticulous",
}));

vi.mock("../api/oauth.api", () => ({
  getOAuthDefaultProject: mocks.getOAuthDefaultProject,
  setOAuthDefaultProject: mocks.setOAuthDefaultProject,
}));

vi.mock("../client", () => ({
  buildClient: mocks.buildClient,
}));

const logger = { debug: vi.fn() } as unknown as log.Logger;

describe("migrateLegacySelectedProjectIfPresent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildClient.mockReturnValue({});
  });

  it("does nothing when there is no legacy file", async () => {
    mocks.existsSync.mockReturnValue(false);

    await migrateLegacySelectedProjectIfPresent("jwt", logger);

    expect(mocks.getOAuthDefaultProject).not.toHaveBeenCalled();
    expect(mocks.setOAuthDefaultProject).not.toHaveBeenCalled();
  });

  it("migrates the legacy project when no default is stored, checking stored-only state (not the auto-pick)", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({ projectId: "proj-1" }));
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });

    await migrateLegacySelectedProjectIfPresent("jwt", logger);

    // Regression (item 4): the migration must read the *stored* default only —
    // otherwise a transient sole-project auto-pick reads as a stored default and
    // the legacy file is dropped without migrating.
    expect(mocks.getOAuthDefaultProject).toHaveBeenCalledWith(
      {},
      { includeAutoPick: false },
    );
    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith({}, "proj-1");
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });

  it("preserves an existing stored default and does not overwrite it", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({ projectId: "proj-1" }));
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: "proj-other" });

    await migrateLegacySelectedProjectIfPresent("jwt", logger);

    expect(mocks.setOAuthDefaultProject).not.toHaveBeenCalled();
    // File is still removed — a stored default already exists, so there's
    // nothing left to migrate.
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });

  it("leaves the file in place when persisting the default fails", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({ projectId: "proj-1" }));
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });
    mocks.setOAuthDefaultProject.mockRejectedValue(new Error("network"));

    await migrateLegacySelectedProjectIfPresent("jwt", logger);

    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it("discards a corrupt legacy file without calling the backend", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue("not json");

    await migrateLegacySelectedProjectIfPresent("jwt", logger);

    expect(mocks.getOAuthDefaultProject).not.toHaveBeenCalled();
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });
});
