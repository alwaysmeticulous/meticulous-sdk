import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectFramework,
  unsupportedSsrMessage,
  unsupportedSsrWarningMessage,
} from "../detect-framework";
import { discoverFrontendApps } from "../discover-apps";

const dirs: string[] = [];

const makeProject = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-detect-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("detectFramework", () => {
  it("allows Next.js Pages Router", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "pages/index.tsx": "export default function Page() { return null }",
    });
    const result = detectFramework(root);
    expect(result.framework).toBe("nextjs-pages");
    expect(result.isUnsupportedSsr).toBe(false);
  });

  it("warns about Next.js App Router even when a root layout exists", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/layout.tsx":
        "export default function Layout({ children }) { return children }",
    });
    const result = detectFramework(root);
    expect(result.framework).toBe("nextjs-app");
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("ambiguous");
  });

  it("is only ambiguous about an `app/` directory with no root layout", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/helpers.ts": "export const noop = () => undefined;",
    });
    const result = detectFramework(root);
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("ambiguous");
  });

  it("is only ambiguous when both `pages/` and `app/` exist", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "pages/index.tsx": "export default function Page() { return null }",
      "app/layout.tsx":
        "export default function Layout({ children }) { return children }",
    });
    const result = detectFramework(root);
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("ambiguous");
  });

  it("allows React SPA", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        dependencies: { react: "18.0.0", "react-dom": "18.0.0" },
      }),
    });
    const result = detectFramework(root);
    expect(result.framework).toBe("react-spa");
    expect(result.isUnsupportedSsr).toBe(false);
  });

  it("blocks Nuxt when SSR is enabled (default)", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "3.0.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({})",
    });
    const result = detectFramework(root);
    expect(result.framework).toBe("nuxt");
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("high");
  });

  it("is only ambiguous about Nuxt without a config file", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "3.0.0" } }),
    });
    const result = detectFramework(root);
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("ambiguous");
  });

  it("is only ambiguous about SvelteKit without an adapter", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        devDependencies: { "@sveltejs/kit": "2.0.0" },
      }),
    });
    const result = detectFramework(root);
    expect(result.isUnsupportedSsr).toBe(true);
    expect(result.unsupportedSsrConfidence).toBe("ambiguous");
  });

  it("allows Nuxt when ssr: false", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "3.0.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ ssr: false })",
    });
    const result = detectFramework(root);
    expect(result.framework).toBe("nuxt");
    expect(result.isUnsupportedSsr).toBe(false);
    expect(result.unsupportedSsrConfidence).toBeNull();
  });

  it("mentions supported vs unsupported SSR in the message", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "3.0.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({})",
    });
    const message = unsupportedSsrMessage(detectFramework(root));
    expect(message).toContain("cannot install yet");
    expect(message).toContain("Next.js Pages Router");
  });

  it("explains that the reviewer will validate the warning", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/helpers.ts": "export const noop = () => undefined;",
    });
    const message = unsupportedSsrWarningMessage(detectFramework(root));
    expect(message).toContain("reviewer validate");
    expect(message).toContain("may not be a Next.js App Router");
  });
});

describe("discoverFrontendApps", () => {
  it("returns root for a single-package SPA", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "web",
        dependencies: { react: "18.0.0" },
      }),
    });
    const apps = discoverFrontendApps(root);
    expect(apps).toHaveLength(1);
    expect(apps[0].path).toBe(".");
  });

  it("discovers multiple apps in a monorepo", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["apps/*"],
      }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "apps/web/package.json": JSON.stringify({
        name: "web",
        dependencies: { next: "14.0.0" },
      }),
      "apps/web/pages/index.tsx":
        "export default function Page() { return null }",
      "apps/admin/package.json": JSON.stringify({
        name: "admin",
        dependencies: { react: "18.0.0" },
        scripts: { start: "node scripts/dev.js" },
      }),
      "apps/api/package.json": JSON.stringify({
        name: "api",
        dependencies: { express: "4.0.0" },
      }),
    });
    const apps = discoverFrontendApps(root);
    expect(apps.map((a) => a.path).sort()).toEqual(["apps/admin", "apps/web"]);
  });

  it("skips library packages (main/exports entry points) without app markers", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": JSON.stringify({
        name: "web",
        dependencies: { react: "18.0.0" },
      }),
      "apps/web/index.html": "<html></html>",
      "packages/ui/package.json": JSON.stringify({
        name: "@acme/ui",
        main: "src/index.ts",
        dependencies: { react: "18.0.0" },
      }),
      "packages/utils/package.json": JSON.stringify({
        name: "@acme/utils",
        exports: { ".": "./src/index.ts" },
        peerDependencies: { react: "18.0.0" },
      }),
      // Shared config package: frontend dep but no entry points and nothing
      // runnable (Grafana's @grafana/plugin-configs shape).
      "packages/plugin-configs/package.json": JSON.stringify({
        name: "@acme/plugin-configs",
        private: true,
        dependencies: { react: "18.0.0", "terser-webpack-plugin": "5.0.0" },
      }),
    });
    const apps = discoverFrontendApps(root);
    expect(apps.map((a) => a.path)).toEqual(["apps/web"]);
  });

  it("keeps the repo-root app when the monorepo packages are libraries (Grafana shape)", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "grafana",
        private: true,
        workspaces: { packages: ["packages/*"] },
        dependencies: { react: "18.0.0", "react-dom": "18.0.0" },
        scripts: { start: "webpack serve --config scripts/webpack.dev.js" },
      }),
      "packages/grafana-ui/package.json": JSON.stringify({
        name: "@grafana/ui",
        main: "src/index.ts",
        types: "src/index.ts",
        publishConfig: { access: "public" },
        dependencies: { react: "18.0.0" },
      }),
      "packages/grafana-sql/package.json": JSON.stringify({
        name: "@grafana/sql",
        main: "src/index.ts",
        dependencies: { react: "18.0.0" },
      }),
    });
    const apps = discoverFrontendApps(root);
    expect(apps.map((a) => a.path)).toEqual(["."]);
    expect(apps[0].name).toBe("grafana");
  });

  it("lists the repo-root app first alongside nested apps", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "root-app",
        private: true,
        workspaces: ["apps/*"],
        dependencies: { react: "18.0.0" },
        scripts: { dev: "vite" },
      }),
      "apps/web/package.json": JSON.stringify({
        name: "web",
        dependencies: { next: "14.0.0" },
      }),
      "apps/web/pages/index.tsx":
        "export default function Page() { return null }",
    });
    const apps = discoverFrontendApps(root);
    expect(apps.map((a) => a.path)).toEqual([".", "apps/web"]);
  });

  it("skips symlinked app directories that resolve outside the repo", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["apps/*"],
      }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "apps/web/package.json": JSON.stringify({
        name: "web",
        dependencies: { next: "14.0.0" },
      }),
      "apps/web/pages/index.tsx":
        "export default function Page() { return null }",
    });
    const outside = makeProject({
      "package.json": JSON.stringify({
        name: "evil-app",
        dependencies: { react: "18.0.0" },
        scripts: { start: "vite" },
      }),
      "index.html": "<html></html>",
    });
    mkdirSync(join(root, "apps"), { recursive: true });
    symlinkSync(outside, join(root, "apps", "evil"));

    const apps = discoverFrontendApps(root);
    expect(apps.map((a) => a.path)).toEqual(["apps/web"]);
  });
});
