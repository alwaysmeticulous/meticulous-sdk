const FRONTEND_EXTENSIONS = new Set([
  "tsx",
  "jsx",
  "ts",
  "js",
  "mjs",
  "vue",
  "svelte",
  "astro",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "html",
  "svg",
]);

const NON_UI_PATH_PATTERNS = [
  /(^|\/)(__tests__|__mocks__|tests?|e2e|cypress|playwright|fixtures|mocks?)\//,
  /\.(test|spec|stories|story|e2e|cy)\.[a-z]+$/,
  /\.d\.ts$/,
  /(^|\/)(scripts|tools|\.github|\.husky|\.storybook|docs?)\//,
  /(^|\/)(server|api|backend|migrations?|prisma)\//,
  /(^|\/)[^/]*\.config\.[a-z]+$/,
  /(^|\/)(dist|build|out|coverage|node_modules|vendor)\//,
];

const DEPENDENCY_MANIFESTS = /(^|\/)package\.json$/;

/**
 * Whether a changed file plausibly affects what the app renders: source and
 * style files under the app, excluding tests, stories, tooling and server code.
 */
export const isFrontendFile = (path: string, appPath: string): boolean => {
  if (!isUnderApp(path, appPath)) {
    return false;
  }
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (!FRONTEND_EXTENSIONS.has(extension)) {
    return false;
  }
  return !NON_UI_PATH_PATTERNS.some((pattern) => pattern.test(path));
};

export const isDependencyManifest = (path: string, appPath: string): boolean =>
  DEPENDENCY_MANIFESTS.test(path) &&
  (isUnderApp(path, appPath) || !path.includes("/"));

const isUnderApp = (path: string, appPath: string): boolean => {
  const normalized = appPath.replace(/^\.\/?/, "").replace(/\/+$/, "");
  return normalized === "" || path.startsWith(`${normalized}/`);
};
