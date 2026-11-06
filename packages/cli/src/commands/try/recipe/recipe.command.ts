import { readFileSync } from "fs";
import { resolve } from "path";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
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
  printResult(options.json, { path, recipe: validation.recipe }, () => [
    `Saved build recipe to ${path}`,
  ]);
};

interface ShowOptions {
  cwd: string | undefined;
  json: boolean;
}

const showHandler = (options: ShowOptions): void => {
  const recipe = readWorkspaceJson<BuildRecipe>(
    repoRootFrom(options.cwd),
    TRY_PATHS.recipe,
  );
  if (!recipe) {
    throw new CliUserError(
      `No build recipe saved yet. Save one with \`${CLI_COMMAND} try recipe save --file <json>\`.`,
    );
  }
  printResult(options.json, recipe, () => [JSON.stringify(recipe, null, 2)]);
};

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
