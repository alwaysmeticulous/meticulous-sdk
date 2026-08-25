import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS_SETUP_DOCS_URL } from "../docs-urls";
import { confirmSkillsInstall } from "../setup-agent-integrations";

const isInteractive = vi.fn(() => false);
const promptForConfirmation = vi.fn();

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  isInteractiveContext: () => isInteractive(),
}));

vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptForConfirmation(...args) },
}));

describe("confirmSkillsInstall", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    isInteractive.mockReturnValue(false);
    promptForConfirmation.mockReset();
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it("preserves automatic installation in non-interactive runs", async () => {
    await expect(confirmSkillsInstall()).resolves.toBe(true);
    expect(promptForConfirmation).not.toHaveBeenCalled();
  });

  it("explains the skills and links to the agent introduction", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ installSkills: true });

    await expect(confirmSkillsInstall()).resolves.toBe(true);

    expect(log.mock.calls.flat().join("\n")).toContain(AGENTS_SETUP_DOCS_URL);
    expect(promptForConfirmation).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "confirm",
        name: "installSkills",
        default: true,
      }),
    ]);
  });

  it("returns false when the user declines", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ installSkills: false });

    await expect(confirmSkillsInstall()).resolves.toBe(false);
  });
});
