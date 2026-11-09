import type { SelfOnboardResponse } from "@alwaysmeticulous/client";
import { describe, expect, it } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  nthProjectName,
  selfOnboardNewProject,
} from "../start/self-onboard-project";
import { MAX_PROJECT_NAME_LENGTH } from "../start/repo-facts";

const response = (name: string, created: boolean): SelfOnboardResponse => ({
  created,
  organization: { id: "org-1", name: "org" },
  project: { id: `project-${name}`, name },
  apiToken: "api-token",
  recordingToken: "recording-token",
});

describe("nthProjectName", () => {
  it("uses the base name for the first attempt", () => {
    expect(nthProjectName("my-app", 1)).toBe("my-app");
  });

  it("suffixes later attempts", () => {
    expect(nthProjectName("my-app", 2)).toBe("my-app-2");
    expect(nthProjectName("my-app", 13)).toBe("my-app-13");
  });

  it("keeps suffixed names within the length cap and distinct", () => {
    const base = "a".repeat(MAX_PROJECT_NAME_LENGTH);
    const second = nthProjectName(base, 2);
    const third = nthProjectName(base, 3);
    expect(second).toHaveLength(MAX_PROJECT_NAME_LENGTH);
    expect(second.endsWith("-2")).toBe(true);
    expect(third.endsWith("-3")).toBe(true);
    expect(second).not.toBe(third);
  });
});

describe("selfOnboardNewProject", () => {
  it("walks suffixed names until one is actually created", async () => {
    const requested: string[] = [];
    const result = await selfOnboardNewProject("my-app", (name) => {
      requested.push(name);
      return Promise.resolve(response(name, name === "my-app-3"));
    });
    expect(requested).toEqual(["my-app", "my-app-2", "my-app-3"]);
    expect(result.created).toBe(true);
    expect(result.project.name).toBe("my-app-3");
  });

  it("fails rather than reusing a project when every name is taken", async () => {
    await expect(
      selfOnboardNewProject("my-app", (name) =>
        Promise.resolve(response(name, false)),
      ),
    ).rejects.toThrow(CliUserError);
  });
});
