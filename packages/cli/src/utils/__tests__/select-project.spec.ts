import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  fetchAccessibleProjects,
  formatProjectSlug,
  selectAndStoreProject,
  selectProjectOnLogin,
} from "../select-project";

const mocks = vi.hoisted(() => ({
  getOAuthProjects: vi.fn(),
  setOAuthDefaultProject: vi.fn(),
  getOAuthDefaultProject: vi.fn(),
  isFetchError: vi.fn(() => false),
  prompt: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getOAuthProjects: mocks.getOAuthProjects,
  setOAuthDefaultProject: mocks.setOAuthDefaultProject,
  getOAuthDefaultProject: mocks.getOAuthDefaultProject,
  isFetchError: mocks.isFetchError,
}));

// The backend resolves the identifier and returns the resolved project; model
// that here.
const resolved = (org: string, name: string, id: string) => ({
  projectId: id,
  name,
  organization: { id: `${org}-id`, name: org },
});

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: vi.fn(),
}));

vi.mock("inquirer", () => ({ default: { prompt: mocks.prompt } }));

const project = (org: string, name: string, id: string) => ({
  id,
  name,
  organization: { id: `${org}-id`, name: org },
});

const fakeClient = {} as never;

describe("selectAndStoreProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an explicit identifier to the backend verbatim (not matched client-side)", async () => {
    // A bare name, id, or slug all go straight to the backend, which resolves
    // flexibly and returns the resolved project.
    mocks.setOAuthDefaultProject.mockResolvedValue(
      resolved("OrgB", "App2", "id-2"),
    );

    const result = await selectAndStoreProject({
      client: fakeClient,
      project: "App2",
    });

    expect(result).toBe("OrgB/App2");
    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "App2",
    );
    // No client-side project listing for an explicit identifier.
    expect(mocks.getOAuthProjects).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace from the provided identifier", async () => {
    mocks.setOAuthDefaultProject.mockResolvedValue(
      resolved("OrgA", "App1", "id-1"),
    );

    const result = await selectAndStoreProject({
      client: fakeClient,
      project: "  OrgA/App1  ",
    });

    expect(result).toBe("OrgA/App1");
    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "OrgA/App1",
    );
  });

  it("throws with the available list when the backend can't resolve the identifier", async () => {
    mocks.setOAuthDefaultProject.mockRejectedValueOnce(new Error("not found"));
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    await expect(
      selectAndStoreProject({
        client: fakeClient,
        project: "Missing",
      }),
    ).rejects.toThrow(/Available projects/);
  });

  it("auto-selects the only project when no identifier is provided", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    const result = await selectAndStoreProject({
      client: fakeClient,
    });

    expect(result).toBe("OrgA/App1");
    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "id-1",
    );
  });

  it("throws when no projects are accessible", async () => {
    mocks.getOAuthProjects.mockResolvedValue([]);

    await expect(
      selectAndStoreProject({ client: fakeClient }),
    ).rejects.toBeInstanceOf(CliUserError);
  });

  it("throws without prompting when several projects exist and prompting is disabled", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);

    const caught = await selectAndStoreProject({
      client: fakeClient,
      allowInteractivePrompt: false,
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).severity).toBe("warn");
    expect((caught as CliUserError).exitCode).toBe(1);
    expect(mocks.setOAuthDefaultProject).not.toHaveBeenCalled();
  });
});

describe("selectProjectOnLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists an explicit --project (resolved by the backend)", async () => {
    mocks.setOAuthDefaultProject.mockResolvedValue(
      resolved("OrgB", "App2", "id-2"),
    );

    await selectProjectOnLogin({
      client: fakeClient,
      project: "OrgB/App2",
      interactive: true,
    });

    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "OrgB/App2",
    );
  });

  it("auto-selects and persists the sole project (no stored-default lookup needed)", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    await selectProjectOnLogin({ client: fakeClient, interactive: true });

    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "id-1",
    );
    // Only >1-project accounts consult the stored default (to respect it);
    // a sole project is selected directly.
    expect(mocks.getOAuthDefaultProject).not.toHaveBeenCalled();
  });

  it("respects an existing stored default (multi-project) without re-persisting", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);
    mocks.getOAuthDefaultProject.mockResolvedValue({
      projectId: "id-2",
      name: "App2",
      organization: { id: "OrgB-id", name: "OrgB" },
    });

    await selectProjectOnLogin({ client: fakeClient, interactive: false });

    expect(mocks.setOAuthDefaultProject).not.toHaveBeenCalled();
  });

  it("succeeds non-interactively when a default already exists, even with multiple projects", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);
    mocks.getOAuthDefaultProject.mockResolvedValue({
      projectId: "id-1",
      name: "App1",
      organization: { id: "OrgA-id", name: "OrgA" },
    });

    await expect(
      selectProjectOnLogin({ client: fakeClient, interactive: false }),
    ).resolves.toBeUndefined();
  });

  it("throws headlessly when several projects exist and no default is set", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });

    const caught = await selectProjectOnLogin({
      client: fakeClient,
      interactive: false,
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(CliUserError);
    expect(mocks.setOAuthDefaultProject).not.toHaveBeenCalled();
  });

  it("prompts and persists when interactive with several projects and no default", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });
    mocks.prompt.mockResolvedValue({ projectId: "id-2" });

    await selectProjectOnLogin({ client: fakeClient, interactive: true });

    expect(mocks.setOAuthDefaultProject).toHaveBeenCalledWith(
      fakeClient,
      "id-2",
    );
  });
});

describe("formatProjectSlug", () => {
  it("formats organization/name when both are present", () => {
    expect(
      formatProjectSlug({
        projectId: "id-1",
        name: "App1",
        organization: { id: "org-1", name: "OrgA" },
      }),
    ).toBe("OrgA/App1");
  });

  it("falls back to the bare id when name/organization are absent", () => {
    expect(formatProjectSlug({ projectId: "id-1" })).toBe("id-1");
  });

  it("falls back to an empty string when nothing is set", () => {
    expect(formatProjectSlug({ projectId: null })).toBe("");
  });
});

describe("fetchAccessibleProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns projects sorted alphabetically by organization/project slug (case-insensitive)", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("orgB", "App1", "id-b1"),
      project("OrgA", "Zeta", "id-az"),
      project("OrgA", "alpha", "id-aa"),
      project("orgB", "app2", "id-b2"),
    ]);

    const result = await fetchAccessibleProjects(fakeClient);

    expect(result.map((p) => `${p.organization.name}/${p.name}`)).toEqual([
      "OrgA/alpha",
      "OrgA/Zeta",
      "orgB/App1",
      "orgB/app2",
    ]);
  });

  it("does not mutate the array returned by the client", async () => {
    const original = [
      project("orgB", "App1", "id-b1"),
      project("OrgA", "alpha", "id-aa"),
    ];
    mocks.getOAuthProjects.mockResolvedValue(original);

    await fetchAccessibleProjects(fakeClient);

    expect(original.map((p) => p.id)).toEqual(["id-b1", "id-aa"]);
  });
});
