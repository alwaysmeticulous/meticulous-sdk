import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  resolveProjectIdentifier,
  resolvePinnedProjectSlug,
} from "../resolve-project-identifier";

const mocks = vi.hoisted(() => ({
  resolveDefaultProjectId: vi.fn(),
  isOAuthJwt: vi.fn(),
  createClient: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  resolveDefaultProjectId: mocks.resolveDefaultProjectId,
  isOAuthJwt: mocks.isOAuthJwt,
  createClient: mocks.createClient,
  getProject: mocks.getProject,
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

describe("resolvePinnedProjectSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
  });

  it("returns the organization/name slug for the token's bound project", async () => {
    mocks.getProject.mockResolvedValue({
      name: "My App",
      organization: { name: "Acme" },
    });

    expect(await resolvePinnedProjectSlug("prat-abc")).toBe("Acme/My App");
  });

  it("returns null when the project can't be resolved", async () => {
    mocks.getProject.mockResolvedValue(null);

    expect(await resolvePinnedProjectSlug("prat-abc")).toBeNull();
  });

  it("swallows errors and returns null", async () => {
    mocks.getProject.mockRejectedValue(new Error("network error"));

    expect(await resolvePinnedProjectSlug("prat-abc")).toBeNull();
  });
});
