import { join, normalize } from "path";
import {
  getMeticulousVersion,
  initLogger,
  logNotice,
  setLogLevel,
  setMeticulousLocalDataDir,
} from "@alwaysmeticulous/common";
import { initSentry } from "@alwaysmeticulous/sentry";
import yargs from "yargs";
import { parseJsonArgs } from "./command-utils/json-args";
import { setOptions } from "./command-utils/sentry.utils";
import { CLI_COMMANDS, GLOBAL_OPTIONS } from "./commands/all-commands";
import { deprecatedAliases } from "./commands/deprecated-aliases";
import {
  resolveJsonArgsTarget,
  schemaCommand,
} from "./commands/schema.command";
import { CliUserError } from "./utils/cli-user-error";

const handleDataDir = (dataDir: string | null | undefined): void => {
  setMeticulousLocalDataDir(dataDir);
};

export const main = async (): Promise<void> => {
  initLogger();
  const packageJsonPath = normalize(join(__dirname, "../package.json"));
  const meticulousVersion = await getMeticulousVersion(packageJsonPath);
  await initSentry(meticulousVersion);

  const cli = yargs.scriptName("meticulous").usage(
    `$0 <command>

      Meticulous CLI`,
  );

  // `schemaCommand` and the deprecated aliases are registered alongside the
  // canonical `CLI_COMMANDS` (see all-commands.ts for why they live apart).
  for (const command of [
    ...CLI_COMMANDS,
    schemaCommand,
    ...deprecatedAliases,
  ]) {
    cli.command(command);
  }

  await cli
    .help()
    .strict()
    .demandCommand()
    // yargs renders help groups in creation order, and the default "Options:"
    // group (which holds each command's own options) is otherwise created last,
    // at render time — so the global options below would float above a command's
    // own. Seeding "Options:" with a hidden no-op option registers it first,
    // pushing "Global Options:" beneath each command's own options.
    //
    // A hidden seed is used deliberately: re-grouping a *visible* key (e.g.
    // `help`) into "Options:" and then into "Global Options:" makes yargs 17
    // render it in both groups, so only a hidden phantom seeds the group
    // cleanly. This relies on yargs creating groups lazily in call order; if a
    // future yargs changes that timing the two groups could reorder (a cosmetic
    // help-layout regression only — no behavioural impact).
    .option("_globalOptionsSeed", { hidden: true, boolean: true })
    .group(["_globalOptionsSeed"], "Options:")
    .option(GLOBAL_OPTIONS)
    .group(
      [...Object.keys(GLOBAL_OPTIONS), "help", "version"],
      "Global Options:",
    )
    .middleware(
      [
        (argv) => {
          if (argv.rawJson != null) {
            logNotice("--rawJson is deprecated; use --jsonArgs instead.");
          }
          const jsonArgs = argv.jsonArgs ?? argv.rawJson;
          if (jsonArgs) {
            try {
              // Validate against the invoked command's own options (argv._ is the
              // command path here, before yargs strips it), so --jsonArgs is as
              // strict as passing the flags directly.
              const target = resolveJsonArgsTarget(argv._.map(String));
              if (target.kind !== "leaf") {
                // --jsonArgs carries one command's options; a command group (or
                // an unknown/missing command) has nothing to apply them to.
                throw new CliUserError(
                  target.kind === "group"
                    ? `--jsonArgs is only valid on a specific command, not the '${target.name}' command group. Specify a subcommand.`
                    : "--jsonArgs is only valid together with a specific command.",
                );
              }
              Object.assign(argv, parseJsonArgs(jsonArgs, target.keys));
            } catch (error) {
              // Middleware runs before the handler, so `wrapHandler` can't format
              // this — print the clean message and exit here instead of letting a
              // raw parse error escape as an uncaught stack trace.
              if (error instanceof CliUserError) {
                initLogger()[error.severity](error.message);
                process.exit(error.exitCode);
              }
              throw error;
            }
          }
        },
      ],
      true,
    )
    .middleware([
      // Explicit --logLevel wins; otherwise --verbose=false (the default for
      // agent commands) quietens progress logs so only essential output remains.
      (argv) =>
        setLogLevel(
          argv.logLevel ?? (argv.verbose === false ? "warn" : undefined),
        ),
      (argv) => handleDataDir(argv.dataDir),
      (argv) => setOptions(argv),
    ]).argv;
};

void main();
