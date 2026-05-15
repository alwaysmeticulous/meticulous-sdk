import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  getProjectIdForOAuthCaller,
  resolveProjectIdentifier,
} from "../resolve-project-identifier";

const mocks = vi.hoisted(() => ({
  getStoredProjectId: vi.fn(),
  isOAuthJwt: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getStoredProjectId: mocks.getStoredProjectId,
  isOAuthJwt: mocks.isOAuthJwt,
}));

describe("resolveProjectIdentifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty identifier for project-scoped API tokens", () => {
    mocks.isOAuthJwt.mockReturnValue(false);

    expect(resolveProjectIdentifier("prat-abc")).toEqual({});
    expect(mocks.getStoredProjectId).not.toHaveBeenCalled();
  });

  it("returns the stored project id for OAuth tokens", () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.getStoredProjectId.mockReturnValue("proj-123");

    expect(resolveProjectIdentifier("jwt")).toEqual({ projectId: "proj-123" });
  });

  it("throws a CliUserError when an OAuth caller has no project selected", () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.getStoredProjectId.mockReturnValue(null);

    let caught: unknown;
    try {
      resolveProjectIdentifier("jwt");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toContain("auth set-project");
    expect((caught as CliUserError).exitCode).toBe(1);
  });
});

describe("getProjectIdForOAuthCaller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined for project-scoped API tokens", () => {
    mocks.isOAuthJwt.mockReturnValue(false);

    expect(getProjectIdForOAuthCaller("prat-abc")).toBeUndefined();
    expect(mocks.getStoredProjectId).not.toHaveBeenCalled();
  });

  it("returns undefined when an OAuth caller has no project selected", () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.getStoredProjectId.mockReturnValue(null);

    expect(getProjectIdForOAuthCaller("jwt")).toBeUndefined();
  });

  it("returns the stored project id when one is selected", () => {
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.getStoredProjectId.mockReturnValue("proj-123");

    expect(getProjectIdForOAuthCaller("jwt")).toBe("proj-123");
  });
});
