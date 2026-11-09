import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import { mkdirSafeSync } from "../../onboard/safe-repo-fs";
import {
  HELPER_OPTIONS,
  syncHandler,
  printResult,
  readWorkspaceJson,
  repoRootFrom,
  writeWorkspaceJson,
} from "../shared/helper-options";
import { TRY_PATHS } from "../shared/try-paths";
import { validateRecipe, type BuildRecipe } from "./build-recipe";
import { CLI_COMMAND } from "../shared/cli-command";

interface SaveOptions {
  cwd: string | undefined;
  json: boolean;
  file: string;
}

const saveHandler = (options: SaveOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  const validation = validateRecipe(parseJsonFile(options.file));
  if (!validation.ok) {
    throw new CliUserError(
      `Invalid build recipe:\n${validation.errors.map((error) => `  - ${error}`).join("\n")}`,
    );
  }
  const path = writeWorkspaceJson(
    repoRoot,
    TRY_PATHS.recipe,
    validation.recipe,
  );
  const recipe = withResolvedCacheEnv(repoRoot, validation.recipe);
  printResult(options.json, { path, recipe }, () => [
    `Saved build recipe to ${path}`,
  ]);
};

/** A recipe as printed: `cacheEnv` as stored, plus the paths to actually export. */
type ShownRecipe = BuildRecipe & {
  /** Each cacheEnv entry resolved to an absolute, already-created directory. */
  cacheEnvResolved: Record<string, string>;
};

interface ShowOptions {
  cwd: string | undefined;
  json: boolean;
}

const showHandler = (options: ShowOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  const stored = readWorkspaceJson<BuildRecipe>(repoRoot, TRY_PATHS.recipe);
  if (!stored) {
    throw new CliUserError(
      `No build recipe saved yet. Save one with \`${CLI_COMMAND} try recipe save --file <json>\`.`,
    );
  }
  const recipe = withResolvedCacheEnv(repoRoot, stored);
  printResult(options.json, recipe, () => [JSON.stringify(recipe, null, 2)]);
};

/**
 * Stored cacheEnv paths are relative to the shared cache dir; what callers
 * export must be absolute. Both outputs add them as `cacheEnvResolved` (and
 * create the dirs, so a build can use them straight away), keeping `cacheEnv`
 * itself as stored so the printed recipe round-trips through `recipe save`.
 */
const withResolvedCacheEnv = (
  repoRoot: string,
  recipe: BuildRecipe,
): ShownRecipe => ({
  ...recipe,
  cacheEnv: recipe.cacheEnv ?? {},
  cacheEnvResolved: Object.fromEntries(
    Object.entries(recipe.cacheEnv ?? {}).map(([name, relativePath]) => [
      name,
      mkdirSafeSync(repoRoot, join(TRY_PATHS.cache, relativePath)),
    ]),
  ),
});

const parseJsonFile = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
  } catch (error) {
    throw new CliUserError(
      `Could not read ${file} as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const recipeSaveCommand: CommandModule<unknown, SaveOptions> = {
  command: "save",
  describe:
    "Validate and save the build recipe (how to install, build and serve the app)",
  builder: {
    ...HELPER_OPTIONS,
    file: {
      string: true,
      demandOption: true,
      description: "Path to the recipe JSON",
    },
  },
  handler: wrapHandler(syncHandler(saveHandler)),
};

const recipeShowCommand: CommandModule<unknown, ShowOptions> = {
  command: "show",
  describe: "Print the saved build recipe",
  builder: { ...HELPER_OPTIONS },
  handler: wrapHandler(syncHandler(showHandler)),
};

export const recipeCommand: CommandModule = {
  command: "recipe",
  describe: "Save or show the build recipe reused by every backtest",
  builder: (yargs) =>
    yargs.command(recipeSaveCommand).command(recipeShowCommand).demandCommand(),
  handler: () => {
    // subcommand handles this
  },
};
