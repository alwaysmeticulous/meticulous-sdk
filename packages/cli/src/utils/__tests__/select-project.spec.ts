import type { Logger } from "loglevel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import { selectAndStoreProject } from "../select-project";

const mocks = vi.hoisted(() => ({
  getOAuthProjects: vi.fn(),
  setStoredProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getOAuthProjects: mocks.getOAuthProjects,
  setStoredProject: mocks.setStoredProject,
}));

const project = (org: string, name: string, id: string) => ({
  id,
  name,
  organization: { id: `${org}-id`, name: org },
});

const fakeLogger = { info: vi.fn() } as unknown as Logger;
const fakeClient = {} as never;

describe("selectAndStoreProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects an exact organization/project slug match", async () => {
    mocks.getOAuthProjects.mockResolvedValue([
      project("OrgA", "App1", "id-1"),
      project("OrgB", "App2", "id-2"),
    ]);

    const result = await selectAndStoreProject({
      client: fakeClient,
      logger: fakeLogger,
      project: "OrgB/App2",
    });

    expect(result).toBe("OrgB/App2");
    expect(mocks.setStoredProject).toHaveBeenCalledWith({
      project: "OrgB/App2",
      projectId: "id-2",
    });
  });

  it("trims surrounding whitespace from the provided slug", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    const result = await selectAndStoreProject({
      client: fakeClient,
      logger: fakeLogger,
      project: "  OrgA/App1  ",
    });

    expect(result).toBe("OrgA/App1");
  });

  it("matches case-sensitively", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    await expect(
      selectAndStoreProject({
        client: fakeClient,
        logger: fakeLogger,
        project: "orga/app1",
      }),
    ).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.setStoredProject).not.toHaveBeenCalled();
  });

  it("throws with the available list when the slug is not found", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    await expect(
      selectAndStoreProject({
        client: fakeClient,
        logger: fakeLogger,
        project: "OrgA/Missing",
      }),
    ).rejects.toThrow(/Available projects/);
  });

  it("auto-selects the only project when no slug is provided", async () => {
    mocks.getOAuthProjects.mockResolvedValue([project("OrgA", "App1", "id-1")]);

    const result = await selectAndStoreProject({
      client: fakeClient,
      logger: fakeLogger,
    });

    expect(result).toBe("OrgA/App1");
    expect(mocks.setStoredProject).toHaveBeenCalledWith({
      project: "OrgA/App1",
      projectId: "id-1",
    });
  });

  it("throws when no projects are accessible", async () => {
    mocks.getOAuthProjects.mockResolvedValue([]);

    await expect(
      selectAndStoreProject({ client: fakeClient, logger: fakeLogger }),
    ).rejects.toBeInstanceOf(CliUserError);
  });
});
