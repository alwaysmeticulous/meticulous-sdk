import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import type { FrameworkDetection } from "../detect-framework";
import type { DiscoveredApp } from "../discover-apps";
import { assertSupportedSsr, resolveSelectedApp } from "../resolve-app";

const isInteractive = vi.fn(() => false);
const promptForConfirmation = vi.fn();

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  isInteractiveContext: () => isInteractive(),
}));

vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptForConfirmation(...args) },
}));

const dirs: string[] = [];

const makeProject = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-resolve-app-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
};

const MONOREPO_FILES = {
  "package.json": JSON.stringify({
    name: "root",
    private: true,
    workspaces: ["apps/*"],
  }),
  "apps/web/package.json": JSON.stringify({
    name: "@acme/web",
    dependencies: { react: "18.0.0" },
    scripts: { dev: "vite" },
  }),
  "apps/admin/package.json": JSON.stringify({
    name: "@acme/admin",
    dependencies: { react: "18.0.0" },
    scripts: { dev: "vite" },
  }),
};

const SELECTED_APP: DiscoveredApp = {
  path: ".",
  name: "web",
  packageName: "web",
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveSelectedApp", () => {
  it("matches the requested app by path", async () => {
    const root = makeProject(MONOREPO_FILES);
    const app = await resolveSelectedApp({
      projectRoot: root,
      app: "apps/web",
    });
    expect(app.path).toBe("apps/web");
  });

  it("matches the requested app by package name", async () => {
    const root = makeProject(MONOREPO_FILES);
    const app = await resolveSelectedApp({
      projectRoot: root,
      app: " @acme/admin ",
    });
    expect(app.path).toBe("apps/admin");
  });

  it("lists the available apps when the requested one is unknown", async () => {
    const root = makeProject(MONOREPO_FILES);
    await expect(
      resolveSelectedApp({ projectRoot: root, app: "apps/nope" }),
    ).rejects.toThrow(/App 'apps\/nope' not found[\s\S]*apps\/web/);
  });

  it("selects the only app without prompting", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "web",
        dependencies: { react: "18.0.0" },
        scripts: { dev: "vite" },
      }),
    });
    const app = await resolveSelectedApp({ projectRoot: root, app: undefined });
    expect(app.path).toBe(".");
  });

  it("falls back to the repo root when no frontend app is detected", async () => {
    const root = makeProject({});
    const app = await resolveSelectedApp({ projectRoot: root, app: undefined });
    expect(app.path).toBe(".");
    expect(app.packageName).toBeNull();
  });

  it("requires --app in a monorepo without an interactive terminal", async () => {
    const root = makeProject(MONOREPO_FILES);
    await expect(
      resolveSelectedApp({ projectRoot: root, app: undefined }),
    ).rejects.toThrow(CliUserError);
  });
});

describe("assertSupportedSsr", () => {
  const confident: FrameworkDetection = {
    framework: "nuxt",
    rendering: "ssr",
    isUnsupportedSsr: true,
    unsupportedSsrConfidence: "high",
    details: ["Nuxt detected (ssr=true)"],
  };
  const ambiguous: FrameworkDetection = {
    ...confident,
    unsupportedSsrConfidence: "ambiguous",
  };
  const nextAppAmbiguous: FrameworkDetection = {
    framework: "nextjs-app",
    rendering: "ssr",
    isUnsupportedSsr: true,
    unsupportedSsrConfidence: "ambiguous",
    details: ["Next.js detected (router: app)"],
  };

  const check = (
    detection: FrameworkDetection,
    skipSsrCheck = false,
  ): Promise<void> =>
    assertSupportedSsr({ detection, selectedApp: SELECTED_APP, skipSsrCheck });

  beforeEach(() => {
    isInteractive.mockReturnValue(false);
    promptForConfirmation.mockReset();
  });

  it("passes through supported setups", async () => {
    await expect(
      check({
        ...confident,
        isUnsupportedSsr: false,
        unsupportedSsrConfidence: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("lets the user confirm a high-confidence detection", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ proceed: true });

    await expect(check(confident)).resolves.toBeUndefined();
    expect(promptForConfirmation).toHaveBeenCalledWith([
      expect.objectContaining({
        message:
          "We think web (.) is an unsupported SSR setup. Continue anyway?",
      }),
    ]);
  });

  it("is bypassed by --skip-ssr-check", async () => {
    await expect(check(confident, true)).resolves.toBeUndefined();
  });

  it("points at the escape hatch when there is no terminal to confirm", async () => {
    await expect(check(confident)).rejects.toThrow(/--skip-ssr-check/);
    expect(promptForConfirmation).not.toHaveBeenCalled();
  });

  it("asks whether to continue when Next.js App Router is detected", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ proceed: true });

    await expect(check(nextAppAmbiguous)).resolves.toBeUndefined();
    expect(promptForConfirmation).toHaveBeenCalledWith([
      expect.objectContaining({
        message: "We think web (.) uses Next.js App Router. Continue anyway?",
      }),
    ]);
  });

  it("stops an ambiguous detection when the user declines", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ proceed: false });

    await expect(check(ambiguous)).rejects.toThrow(CliUserError);
  });
});
