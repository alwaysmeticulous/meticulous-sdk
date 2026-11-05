import { describe, expect, it } from "vitest";
import { validateRecipe } from "../recipe/build-recipe";

const STATIC_RECIPE = {
  kind: "static",
  appDir: ".",
  installCmd: "pnpm install --frozen-lockfile",
  buildCmd: "pnpm build",
  outputDir: "dist",
  serveCmd: "npx --yes serve -s dist -l 4173",
  port: 4173,
  envVarNames: ["VITE_API_URL"],
  backend: { mode: "remote", notes: "public staging API" },
};

describe("validateRecipe", () => {
  it("accepts a static recipe and fills optional fields", () => {
    expect(validateRecipe(STATIC_RECIPE)).toEqual({
      ok: true,
      recipe: {
        ...STATIC_RECIPE,
        containerPort: null,
        healthCheckPath: null,
        notes: "",
      },
    });
  });

  it("accepts a container recipe without an output dir", () => {
    const result = validateRecipe({
      ...STATIC_RECIPE,
      kind: "container",
      outputDir: null,
      buildCmd: 'docker build -t "$TRY_IMAGE_TAG" .',
      containerPort: 3000,
    });
    expect(result.ok).toBe(true);
  });

  it("requires an output dir for static recipes", () => {
    const result = validateRecipe({ ...STATIC_RECIPE, outputDir: null });
    expect(result).toEqual({
      ok: false,
      errors: ["outputDir is required for a static recipe"],
    });
  });

  it("rejects env var values", () => {
    const result = validateRecipe({
      ...STATIC_RECIPE,
      envVarNames: ["API_KEY=sk_live_123"],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/names only/);
  });

  it("reports every problem at once", () => {
    const result = validateRecipe({ kind: "lambda", port: 70000 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        'kind must be "static" or "container"',
        "installCmd must be a non-empty string",
        "port must be an integer port between 1 and 65535",
        expect.stringMatching(/^backend is required/),
      ]),
    );
  });

  it("rejects non-objects", () => {
    expect(validateRecipe([])).toEqual({
      ok: false,
      errors: ["recipe must be a JSON object"],
    });
  });
});
