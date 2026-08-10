import type { MeticulousClient } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendProjectSelectionHint } from "../project-selection-hint";

const mocks = vi.hoisted(() => ({
  getAgentCurrentProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getAgentCurrentProject: mocks.getAgentCurrentProject,
}));

const client = {} as MeticulousClient;

describe("appendProjectSelectionHint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names an OAuth caller's stored default project and how to change it", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "meticulous/Twenty Demo",
      projectId: "id-1",
      source: "user-default",
    });

    const message = await appendProjectSelectionHint(
      "No test run found for commit abc123.",
      client,
      undefined,
    );

    expect(message).toContain("No test run found for commit abc123.");
    expect(message).toContain("meticulous/Twenty Demo");
    expect(message).toContain("auth set-project");
  });

  it("names an auto-picked project distinctly from a stored default", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "meticulous/Only Project",
      projectId: "id-2",
      source: "auto-picked",
    });

    const message = await appendProjectSelectionHint(
      "Nothing found.",
      client,
      undefined,
    );

    expect(message).toContain("meticulous/Only Project");
    expect(message).toContain("automatically selected");
    expect(message).toContain("auth set-project");
  });

  it("names the token's pinned project without suggesting set-project as a certainty", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "Acme/Pinned",
      projectId: "id-3",
      source: "api-token",
    });

    const message = await appendProjectSelectionHint(
      "No recorded sessions found for this project.",
      client,
      undefined,
    );

    expect(message).toContain("Acme/Pinned");
    expect(message).toContain("does not apply to any API token");
    expect(message).toContain("cross-project access");
  });

  it("leaves the message untouched when --project was passed", async () => {
    expect(
      await appendProjectSelectionHint("Nothing found.", client, "org/proj"),
    ).toBe("Nothing found.");
    expect(mocks.getAgentCurrentProject).not.toHaveBeenCalled();
  });

  it("treats an empty or whitespace-only --project as absent, not explicit", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "meticulous/Twenty Demo",
      projectId: "id-1",
      source: "user-default",
    });

    const message = await appendProjectSelectionHint(
      "Nothing found.",
      client,
      "   ",
    );

    expect(message).toContain("meticulous/Twenty Demo");
    expect(mocks.getAgentCurrentProject).toHaveBeenCalled();
  });

  it("still names the commands when the project can't be resolved", async () => {
    mocks.getAgentCurrentProject.mockRejectedValue(new Error("offline"));

    const message = await appendProjectSelectionHint(
      "Nothing found.",
      client,
      undefined,
    );

    expect(message).toContain("auth get-project");
    expect(message).toContain("auth set-project");
  });
});
