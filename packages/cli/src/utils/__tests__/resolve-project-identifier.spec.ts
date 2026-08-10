import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import { resolveProjectIdentifier } from "../resolve-project-identifier";

const mocks = vi.hoisted(() => ({
  resolveDefaultProjectId: vi.fn(),
  isOAuthJwt: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  resolveDefaultProjectId: mocks.resolveDefaultProjectId,
  isOAuthJwt: mocks.isOAuthJwt,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
}));

describe("resolveProjectIdentifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty identifier for project-scoped API tokens", async () => {
    mocks.isOAuthJwt.mockReturnValue(false);

    expect(await resolveProjectIdentifier("prat-abc")).toEqual({});
    expect(mocks.resolveDefaultProjectId).not.toHaveBeenCalled();
  });

  it("returns the default project id for OAuth tokens", async () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.resolveDefaultProjectId.mockResolvedValue("proj-123");

    expect(await resolveProjectIdentifier("jwt")).toEqual({
      projectId: "proj-123",
    });
  });

  it("throws a CliUserError when an OAuth caller has no default project", async () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.resolveDefaultProjectId.mockResolvedValue(null);

    const caught = await resolveProjectIdentifier("jwt").catch((e) => e);

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toContain("auth set-project");
    expect((caught as CliUserError).exitCode).toBe(1);
  });
});
