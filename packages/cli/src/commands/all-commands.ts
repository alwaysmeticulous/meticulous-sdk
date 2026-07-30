import type { CommandModule, Options as YargsOptions } from "yargs";
import { agentCommand } from "./agent/index";
import { authCommand } from "./auth/index";
import { ciCommand } from "./ci/index";
import { crawlCommand } from "./crawl.command";
import { debugCommand } from "./debug/index";
import { downloadCommand } from "./download/index";
import { localCommand } from "./local";
import { projectCommand } from "./project/index";
import { recordCommand } from "./record/index";
import { replayCommand } from "./replay.command";

/**
 * The canonical list of top-level commands. Used both to register them on the
 * CLI (`main.ts`) and to generate the machine-readable schema
 * (`schema.command.ts`), so the two never drift.
 *
 * `schemaCommand` is intentionally omitted: it introspects this list, so
 * including it here would create an import cycle — and it has nothing useful to
 * say about itself. It (and the deprecated aliases) are registered separately in
 * `main.ts`.
 */
export const CLI_COMMANDS: CommandModule<unknown, any>[] = [
  agentCommand,
  authCommand,
  ciCommand,
  crawlCommand,
  debugCommand,
  downloadCommand,
  localCommand,
  projectCommand,
  recordCommand,
  replayCommand,
];

/**
 * Options attached to the root yargs instance in `main.ts`, so they apply to
 * every command. Defined here (rather than inline) so `schema.command.ts` can
 * report them without keeping a hand-maintained second copy.
 */
export const GLOBAL_OPTIONS = {
  logLevel: {
    string: true,
    choices: ["trace", "debug", "info", "warn", "error", "silent"],
    description: "Log level",
  },
  dataDir: {
    string: true,
    description: "Where Meticulous stores data (sessions, replays, etc.)",
  },
  jsonArgs: {
    string: true,
    description:
      "Pass all options as a JSON string (for agent/programmatic use)",
  },
  rawJson: {
    string: true,
    deprecated: "use --jsonArgs instead",
    description: "Deprecated alias for --jsonArgs.",
  },
  // `satisfies` (not a type annotation) so yargs keeps the precise per-option
  // types and can infer `argv` in `main.ts`; the `Record` shape is what the
  // schema generator consumes.
} satisfies Record<string, YargsOptions>;
