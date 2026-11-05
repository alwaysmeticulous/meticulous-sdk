export type BackendMode = "local" | "remote" | "mocked" | "none";

/**
 * How to install, build and serve the app at any commit. Commands run from the
 * repository (or worktree) root. Container recipes tag their image with
 * `$TRY_IMAGE_TAG`, which the caller exports before running `buildCmd`.
 */
export interface BuildRecipe {
  kind: "static" | "container";
  appDir: string;
  installCmd: string;
  buildCmd: string;
  /** Repo-relative static build output. Required for `static`. */
  outputDir: string | null;
  serveCmd: string;
  port: number;
  containerPort: number | null;
  healthCheckPath: string | null;
  /** Names only: values stay in the user's environment. */
  envVarNames: string[];
  backend: { mode: BackendMode; notes: string };
  notes: string;
}

const BACKEND_MODES: BackendMode[] = ["local", "remote", "mocked", "none"];
const ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type RecipeValidation =
  | { ok: true; recipe: BuildRecipe }
  | { ok: false; errors: string[] };

export const validateRecipe = (input: unknown): RecipeValidation => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["recipe must be a JSON object"] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];

  const kind = raw["kind"];
  if (kind !== "static" && kind !== "container") {
    errors.push('kind must be "static" or "container"');
  }
  const appDir = requireString(raw, "appDir", errors);
  const installCmd = requireString(raw, "installCmd", errors);
  const buildCmd = requireString(raw, "buildCmd", errors);
  const serveCmd = requireString(raw, "serveCmd", errors);
  const outputDir = optionalString(raw, "outputDir", errors);
  if (kind === "static" && !outputDir) {
    errors.push("outputDir is required for a static recipe");
  }
  const port = requirePort(raw, "port", errors);
  const containerPort = optionalPort(raw, "containerPort", errors);
  const healthCheckPath = optionalString(raw, "healthCheckPath", errors);
  const envVarNames = validateEnvVarNames(raw["envVarNames"], errors);
  const backend = validateBackend(raw["backend"], errors);
  const notes = optionalString(raw, "notes", errors) ?? "";

  if (errors.length > 0 || (kind !== "static" && kind !== "container")) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    recipe: {
      kind,
      appDir: appDir ?? ".",
      installCmd: installCmd ?? "",
      buildCmd: buildCmd ?? "",
      outputDir,
      serveCmd: serveCmd ?? "",
      port: port ?? 0,
      containerPort,
      healthCheckPath,
      envVarNames,
      backend,
      notes,
    },
  };
};

const requireString = (
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): string | null => {
  const value = raw[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${key} must be a non-empty string`);
    return null;
  }
  return value;
};

const optionalString = (
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): string | null => {
  const value = raw[key];
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${key} must be a string`);
    return null;
  }
  return value;
};

const requirePort = (
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): number | null => {
  const port = optionalPort(raw, key, errors);
  if (port == null && raw[key] == null) {
    errors.push(`${key} is required`);
  }
  return port;
};

const optionalPort = (
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): number | null => {
  const value = raw[key];
  if (value == null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65535
  ) {
    errors.push(`${key} must be an integer port between 1 and 65535`);
    return null;
  }
  return value;
};

const validateEnvVarNames = (value: unknown, errors: string[]): string[] => {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push("envVarNames must be an array of variable names");
    return [];
  }
  const invalid = value.filter(
    (name) => typeof name !== "string" || !ENV_VAR_NAME.test(name),
  );
  if (invalid.length > 0) {
    errors.push(
      "envVarNames must hold names only (e.g. VITE_API_URL), never NAME=value or secret values",
    );
    return [];
  }
  return value as string[];
};

const validateBackend = (
  value: unknown,
  errors: string[],
): BuildRecipe["backend"] => {
  const fallback: BuildRecipe["backend"] = { mode: "none", notes: "" };
  if (value == null) {
    errors.push(
      `backend is required: { "mode": ${BACKEND_MODES.map((mode) => `"${mode}"`).join(" | ")}, "notes": "..." }`,
    );
    return fallback;
  }
  const backend = value as { mode?: unknown; notes?: unknown };
  if (!BACKEND_MODES.includes(backend.mode as BackendMode)) {
    errors.push(`backend.mode must be one of ${BACKEND_MODES.join(", ")}`);
    return fallback;
  }
  return {
    mode: backend.mode as BackendMode,
    notes: typeof backend.notes === "string" ? backend.notes : "",
  };
};
