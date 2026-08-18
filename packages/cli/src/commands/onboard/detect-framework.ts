import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

export type FrameworkKind =
  | "nextjs-pages"
  | "nextjs-app"
  | "react-spa"
  | "vue-spa"
  | "angular-spa"
  | "remix"
  | "nuxt"
  | "sveltekit"
  | "svelte"
  | "unknown";

export type RenderingMode = "csr" | "ssg" | "ssr" | "unknown";

/**
 * How sure the heuristic is about an unsupported-SSR verdict. `"high"` means a
 * config file or router marker said so; `"ambiguous"` means we inferred it from
 * a dependency or directory name and could be misreading a supported app.
 */
export type UnsupportedSsrConfidence = "high" | "ambiguous";

export interface FrameworkDetection {
  framework: FrameworkKind;
  rendering: RenderingMode;
  /** True when SSR is detected and it is not Next.js Pages SSR. */
  isUnsupportedSsr: boolean;
  /** Null unless `isUnsupportedSsr` is true. */
  unsupportedSsrConfidence: UnsupportedSsrConfidence | null;
  details: string[];
}

/** An SSR verdict plus whether config on disk confirmed it. */
interface SsrGuess {
  ssr: boolean;
  confirmedByConfig: boolean;
}

const unsupportedSsrFields = (
  guess: SsrGuess,
): Pick<
  FrameworkDetection,
  "isUnsupportedSsr" | "unsupportedSsrConfidence"
> => {
  if (!guess.ssr) {
    return { isUnsupportedSsr: false, unsupportedSsrConfidence: null };
  }
  return {
    isUnsupportedSsr: true,
    unsupportedSsrConfidence: guess.confirmedByConfig ? "high" : "ambiguous",
  };
};

const pathExists = (root: string, relative: string): boolean =>
  existsSync(join(root, relative));

const readJson = (path: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const hasDependency = (
  pkg: Record<string, unknown> | null,
  name: string,
): boolean => {
  if (!pkg) {
    return false;
  }
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[field];
    if (deps && typeof deps === "object" && name in deps) {
      return true;
    }
  }
  return false;
};

const findNearestPackageJson = (
  root: string,
): Record<string, unknown> | null => {
  const direct = readJson(join(root, "package.json"));
  if (direct) {
    return direct;
  }
  // Shallow monorepo scan
  for (const dir of ["apps", "packages", "web", "frontend", "client"]) {
    const base = join(root, dir);
    if (!existsSync(base) || !statSync(base).isDirectory()) {
      continue;
    }
    for (const child of readdirSync(base)) {
      const pkg = readJson(join(base, child, "package.json"));
      if (pkg) {
        return pkg;
      }
    }
  }
  return null;
};

type NextRouter = "pages" | "app" | "both" | "none";

const nextRouterFor = (markers: {
  hasPages: boolean;
  hasApp: boolean;
  hasAppRouterMarker: boolean;
}): NextRouter => {
  const { hasPages, hasApp, hasAppRouterMarker } = markers;
  if ((hasApp || hasAppRouterMarker) && hasPages) {
    return "both";
  }
  if (hasAppRouterMarker || (hasApp && !hasPages)) {
    return "app";
  }
  if (hasPages) {
    return "pages";
  }
  return "none";
};

const detectNextRouter = (
  root: string,
): { router: NextRouter; hasAppRouterMarker: boolean } => {
  const hasPages =
    pathExists(root, "pages") ||
    pathExists(root, "src/pages") ||
    pathExists(root, "app/pages");
  const hasApp = pathExists(root, "app") || pathExists(root, "src/app");
  const hasAppRouterMarker =
    pathExists(root, "app/layout.tsx") ||
    pathExists(root, "app/layout.jsx") ||
    pathExists(root, "src/app/layout.tsx") ||
    pathExists(root, "src/app/layout.jsx");

  return {
    router: nextRouterFor({ hasPages, hasApp, hasAppRouterMarker }),
    hasAppRouterMarker,
  };
};

const detectNuxtSsr = (
  root: string,
  pkg: Record<string, unknown> | null,
): SsrGuess => {
  for (const p of ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"]) {
    const full = join(root, p);
    if (!existsSync(full)) {
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (/ssr\s*:\s*false/.test(text)) {
      return { ssr: false, confirmedByConfig: true };
    }
    // Nuxt defaults to SSR, and the config did not turn it off.
    return { ssr: true, confirmedByConfig: true };
  }
  // Dependency only: no config to confirm the default.
  return { ssr: hasDependency(pkg, "nuxt"), confirmedByConfig: false };
};

const detectRemixSsr = (
  root: string,
  pkg: Record<string, unknown> | null,
): SsrGuess => {
  if (!hasDependency(pkg, "@remix-run/react") && !hasDependency(pkg, "remix")) {
    return { ssr: false, confirmedByConfig: true };
  }
  let sawConfig = false;
  for (const p of ["vite.config.ts", "vite.config.js", "remix.config.js"]) {
    const full = join(root, p);
    if (!existsSync(full)) {
      continue;
    }
    sawConfig = true;
    const text = readFileSync(full, "utf8");
    if (/ssr\s*:\s*false/.test(text) || /spaMode/.test(text)) {
      return { ssr: false, confirmedByConfig: true };
    }
  }
  // Remix defaults to SSR.
  return { ssr: true, confirmedByConfig: sawConfig };
};

const detectSvelteKitSsr = (
  root: string,
  pkg: Record<string, unknown> | null,
): SsrGuess => {
  if (!hasDependency(pkg, "@sveltejs/kit")) {
    return { ssr: false, confirmedByConfig: true };
  }
  for (const full of [
    join(root, "svelte.config.js"),
    join(root, "svelte.config.ts"),
  ]) {
    if (!existsSync(full)) {
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (/adapter-static/.test(text)) {
      return { ssr: false, confirmedByConfig: true };
    }
    if (/adapter-auto|adapter-node|adapter-vercel|adapter-netlify/.test(text)) {
      return { ssr: true, confirmedByConfig: true };
    }
  }
  // SvelteKit defaults to SSR, but no adapter told us for sure.
  return { ssr: true, confirmedByConfig: false };
};

/**
 * Heuristic framework + rendering detection for the onboard SSR gate.
 * The agentic reviewer still re-validates during install.
 */
export const detectFramework = (projectRoot: string): FrameworkDetection => {
  const details: string[] = [];
  const pkg = findNearestPackageJson(projectRoot);

  if (hasDependency(pkg, "next")) {
    const { router, hasAppRouterMarker } = detectNextRouter(projectRoot);
    details.push(`Next.js detected (router: ${router})`);
    if (router === "pages") {
      return {
        framework: "nextjs-pages",
        rendering: "ssr",
        isUnsupportedSsr: false,
        unsupportedSsrConfidence: null,
        details,
      };
    }
    if (router === "app" || router === "both") {
      details.push(
        "Next.js App Router SSR is not supported by the Meticulous onboard wizard yet",
      );
      // Even when a root layout strongly indicates App Router, let the user
      // override the heuristic: the reviewer can validate the setup before
      // applying any changes.
      if (router === "both") {
        details.push(
          "Both `pages/` and `app/` exist — the app may still be Pages Router",
        );
      } else if (!hasAppRouterMarker) {
        details.push(
          "No root layout found — the `app/` directory may not be a Next.js App Router",
        );
      }
      return {
        framework: "nextjs-app",
        rendering: "ssr",
        isUnsupportedSsr: true,
        unsupportedSsrConfidence: "ambiguous",
        details,
      };
    }
    return {
      framework: "nextjs-pages",
      rendering: "unknown",
      isUnsupportedSsr: false,
      unsupportedSsrConfidence: null,
      details,
    };
  }

  if (hasDependency(pkg, "nuxt") || hasDependency(pkg, "nuxt3")) {
    const guess = detectNuxtSsr(projectRoot, pkg);
    details.push(`Nuxt detected (ssr=${guess.ssr})`);
    if (guess.ssr && !guess.confirmedByConfig) {
      details.push("No nuxt.config found — SSR assumed from the Nuxt default");
    }
    return {
      framework: "nuxt",
      rendering: guess.ssr ? "ssr" : "csr",
      ...unsupportedSsrFields(guess),
      details,
    };
  }

  if (hasDependency(pkg, "@remix-run/react") || hasDependency(pkg, "remix")) {
    const guess = detectRemixSsr(projectRoot, pkg);
    details.push(`Remix detected (ssr=${guess.ssr})`);
    if (guess.ssr && !guess.confirmedByConfig) {
      details.push("No Remix/Vite config found — SSR assumed from the default");
    }
    return {
      framework: "remix",
      rendering: guess.ssr ? "ssr" : "csr",
      ...unsupportedSsrFields(guess),
      details,
    };
  }

  if (hasDependency(pkg, "@sveltejs/kit")) {
    const guess = detectSvelteKitSsr(projectRoot, pkg);
    details.push(`SvelteKit detected (ssr=${guess.ssr})`);
    if (guess.ssr && !guess.confirmedByConfig) {
      details.push("No adapter found in svelte.config — SSR assumed");
    }
    return {
      framework: "sveltekit",
      rendering: guess.ssr ? "ssr" : "ssg",
      ...unsupportedSsrFields(guess),
      details,
    };
  }

  if (hasDependency(pkg, "svelte")) {
    details.push("Svelte (non-Kit) detected — treated as CSR");
    return {
      framework: "svelte",
      rendering: "csr",
      isUnsupportedSsr: false,
      unsupportedSsrConfidence: null,
      details,
    };
  }

  if (hasDependency(pkg, "vue")) {
    details.push("Vue SPA detected");
    return {
      framework: "vue-spa",
      rendering: "csr",
      isUnsupportedSsr: false,
      unsupportedSsrConfidence: null,
      details,
    };
  }

  if (hasDependency(pkg, "@angular/core")) {
    details.push("Angular detected — treated as CSR/SPA");
    return {
      framework: "angular-spa",
      rendering: "csr",
      isUnsupportedSsr: false,
      unsupportedSsrConfidence: null,
      details,
    };
  }

  if (hasDependency(pkg, "react") || hasDependency(pkg, "react-dom")) {
    details.push("React SPA detected");
    return {
      framework: "react-spa",
      rendering: "csr",
      isUnsupportedSsr: false,
      unsupportedSsrConfidence: null,
      details,
    };
  }

  details.push("Could not detect framework; proceeding cautiously");
  return {
    framework: "unknown",
    rendering: "unknown",
    isUnsupportedSsr: false,
    unsupportedSsrConfidence: null,
    details,
  };
};

/** Shown before asking whether to continue with a detected unsupported setup. */
export const unsupportedSsrWarningMessage = (
  detection: FrameworkDetection,
): string =>
  [
    "This app looks like an unsupported SSR setup.",
    "",
    `Detected: framework=${detection.framework}, rendering=${detection.rendering}`,
    ...detection.details.map((d) => `  - ${d}`),
    "",
    "The Meticulous onboard wizard supports CSR / SPA / static / SSG apps and Next.js Pages Router.",
    "You can continue and have the install reviewer validate this detection before making changes.",
    "If it confirms SSR outside Next.js Pages, the install may need guided setup.",
  ].join("\n");

export const unsupportedSsrMessage = (detection: FrameworkDetection): string =>
  [
    "Meticulous cannot install yet for this project via the Meticulous onboard wizard.",
    "",
    `Detected: framework=${detection.framework}, rendering=${detection.rendering}`,
    ...detection.details.map((d) => `  - ${d}`),
    "",
    "The Meticulous onboard wizard currently supports:",
    "  - CSR / SPA / static / SSG apps (including Remix, Nuxt, or SvelteKit when SSR is disabled)",
    "  - Next.js Pages Router (including getServerSideProps)",
    "",
    "SSR setups outside Next.js Pages (e.g. Next.js App Router SSR, Remix/Nuxt/SvelteKit with SSR,",
    "or custom Node SSR) need a guided install. Contact support or your Meticulous FDE,",
    "or see https://app.meticulous.ai/docs/onboarding-guide",
  ].join("\n");
