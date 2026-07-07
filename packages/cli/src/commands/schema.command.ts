import type { CommandModule, Options as YargsOptions } from "yargs";
import { printJson } from "../command-utils/print-json";
import { wrapHandler } from "../command-utils/sentry.utils";
import { CLI_COMMANDS, GLOBAL_OPTIONS } from "./all-commands";
import { deprecatedAliases } from "./deprecated-aliases";

interface OptionSchema {
  type?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  choices?: unknown[];
  hidden?: boolean;
  deprecated?: boolean | string;
  alias?: string | readonly string[];
}

interface CommandSchema {
  command: string;
  describe: string;
  aliases?: string[];
  positionals?: string[];
  options?: Record<string, OptionSchema>;
  subcommands?: CommandSchema[];
}

interface Options {
  command?: string[];
}

const buildCommandSchema = (
  commands: CommandModule[],
  inheritedOptions: Record<string, OptionSchema>,
  // `describe: false` hides a command from the public schema. The `--jsonArgs`
  // allow-list needs those commands' options too (a super-user-gated command
  // still accepts its flags programmatically), so it walks with includeHidden.
  includeHidden = false,
): CommandSchema[] => {
  return commands
    .filter((cmd) => includeHidden || cmd.describe !== false)
    .map((cmd) => commandModuleToSchema(cmd, inheritedOptions, includeHidden));
};

const commandModuleToSchema = (
  cmd: CommandModule,
  inheritedOptions: Record<string, OptionSchema>,
  includeHidden: boolean,
): CommandSchema => {
  const { name, aliases } = getCommandNames(cmd);
  const positionals = getPositionals(cmd);
  const describe = typeof cmd.describe === "string" ? cmd.describe : "";
  const base: CommandSchema = {
    command: name,
    describe,
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(positionals.length > 0 ? { positionals } : {}),
  };

  if (typeof cmd.builder === "function") {
    const submodules: CommandModule[] = [];
    const groupOptions: Record<string, YargsOptions> = {};
    const mockYargs = createMockYargs(submodules, groupOptions);
    (cmd.builder as (y: unknown) => unknown)(mockYargs);
    // Options declared on a group builder (e.g. agent's --verbose/--json) are
    // inherited by every subcommand, so thread them down into the subcommands.
    const inherited = { ...inheritedOptions };
    for (const [key, opt] of Object.entries(groupOptions)) {
      inherited[key] = yargsOptionToSchema(opt);
    }
    const subcommands = buildCommandSchema(
      submodules,
      inherited,
      includeHidden,
    );
    return {
      ...base,
      ...(subcommands.length > 0 ? { subcommands } : {}),
    };
  }

  // A leaf command (object builder, or none at all). Top-level global options
  // first, then options inherited from any enclosing group, then the command's
  // own — all converted the same way, so the schema stays in sync with how
  // they're actually declared. A command with no builder (e.g. auth logout)
  // still accepts the global flags, so we always emit them.
  const ownBuilder =
    cmd.builder && typeof cmd.builder === "object"
      ? (cmd.builder as Record<string, YargsOptions>)
      : {};
  const options: Record<string, OptionSchema> = {};
  for (const [key, opt] of Object.entries(
    GLOBAL_OPTIONS as Record<string, YargsOptions>,
  )) {
    options[key] = yargsOptionToSchema(opt);
  }
  Object.assign(options, inheritedOptions);
  for (const [key, opt] of Object.entries(ownBuilder)) {
    options[key] = yargsOptionToSchema(opt);
  }
  return { ...base, options };
};

/**
 * A command's canonical name plus any aliases. yargs encodes aliases either as
 * extra entries in an array `command` (`["simulate", "replay"]`) or via the
 * `aliases` field; we normalise both, stripping positional placeholders like
 * `<id>` / `[command..]` down to the leading token.
 */
const getCommandNames = (
  cmd: CommandModule,
): { name: string; aliases: string[] } => {
  const commandEntries = Array.isArray(cmd.command)
    ? cmd.command
    : cmd.command != null
      ? [cmd.command]
      : [""];
  const [name, ...arrayAliases] = commandEntries.map(
    (entry) => entry.split(" ")[0],
  );
  const aliasField =
    cmd.aliases == null
      ? []
      : Array.isArray(cmd.aliases)
        ? cmd.aliases
        : [cmd.aliases];
  return { name: name ?? "", aliases: [...arrayAliases, ...aliasField] };
};

/**
 * The names of a command's positional arguments, parsed from its command string
 * (e.g. `schema [command..]` → `["command"]`, `replay-diff <replayDiffId>` →
 * `["replayDiffId"]`). yargs exposes each on argv under its bare name, so they're
 * valid keys to pass via `--jsonArgs` just like options.
 */
const getPositionals = (cmd: CommandModule): string[] => {
  const first = Array.isArray(cmd.command) ? cmd.command[0] : cmd.command;
  if (typeof first !== "string") {
    return [];
  }
  return first
    .split(" ")
    .slice(1) // drop the command name; the rest are positional tokens
    .map((token) => token.replace(/[<>[\]]/g, "").replace(/\.\.$/, ""))
    .filter((name) => name.length > 0);
};

const yargsOptionToSchema = (opt: YargsOptions): OptionSchema => {
  const schema: OptionSchema = {};
  if (opt.type) {
    schema.type = opt.type;
  } else if (opt.boolean) {
    schema.type = "boolean";
  } else if (opt.string) {
    schema.type = "string";
  } else if (opt.number) {
    schema.type = "number";
  }
  const desc = opt.description ?? opt.describe;
  if (desc) {
    schema.description = desc;
  }
  if ("default" in opt) {
    schema.default = opt.default;
  }
  if (opt.demandOption || opt.required) {
    schema.required = true;
  }
  if (opt.choices) {
    schema.choices = opt.choices as unknown[];
  }
  if (opt.hidden) {
    schema.hidden = true;
  }
  if (opt.deprecated) {
    schema.deprecated = opt.deprecated;
  }
  if (opt.alias) {
    schema.alias = opt.alias;
  }
  return schema;
};

const createMockYargs = (
  captured: CommandModule[],
  capturedOptions: Record<string, YargsOptions>,
): unknown => {
  // Record group-level options (both `.option(key, opt)` and `.option({...})`)
  // so they can be inherited by subcommands in the schema.
  const captureOption = (
    keyOrOptions: string | Record<string, YargsOptions>,
    opt?: YargsOptions,
  ) => {
    if (typeof keyOrOptions === "string") {
      if (opt) {
        capturedOptions[keyOrOptions] = opt;
      }
    } else {
      Object.assign(capturedOptions, keyOrOptions);
    }
    return proxy;
  };
  const handlers: Record<string, unknown> = {
    command: (module: CommandModule) => {
      captured.push(module);
      return proxy;
    },
    option: captureOption,
    options: captureOption,
  };
  // Any other yargs builder method (`.help()`, `.strict()`, `.check()`,
  // `.config()`, `.implies()`, `.coerce()`, …) is a fluent no-op that returns
  // the mock, so a builder using one doesn't crash schema generation — those
  // methods add no options for the schema to capture anyway.
  const proxy: unknown = new Proxy(handlers, {
    get: (target, prop) =>
      prop in target ? target[prop as string] : () => proxy,
  });
  return proxy;
};

const findInSchema = (
  nodes: CommandSchema[],
  pathSegments: string[],
): CommandSchema | CommandSchema[] => {
  if (pathSegments.length === 0) {
    return nodes;
  }
  const [head, ...rest] = pathSegments;
  const match = nodes.find(
    (n) => n.command === head || n.aliases?.includes(head),
  );
  if (!match) {
    throw new Error(
      `Command not found: "${head}". Available: ${nodes.map((n) => n.command).join(", ")}`,
    );
  }
  if (rest.length === 0) {
    return match;
  }
  if (!match.subcommands) {
    throw new Error(`"${head}" has no subcommands`);
  }
  return findInSchema(match.subcommands, rest);
};

const stripOptions = (node: CommandSchema): Omit<CommandSchema, "options"> => ({
  command: node.command,
  describe: node.describe,
  ...(node.aliases ? { aliases: node.aliases } : {}),
  ...(node.positionals ? { positionals: node.positionals } : {}),
  ...(node.subcommands
    ? { subcommands: node.subcommands.map(stripOptions) }
    : {}),
});

/**
 * Builds the schema for the whole CLI, or for the command named by `path`.
 * Leaf commands keep their `options`; groups and the top-level list have their
 * options stripped (only the tree of names/describes is returned there).
 */
export const generateSchema = (
  path?: string[],
): CommandSchema | Omit<CommandSchema, "options"> | CommandSchema[] => {
  const schema = buildCommandSchema(CLI_COMMANDS, {});
  const result = path && path.length > 0 ? findInSchema(schema, path) : schema;

  const isLeaf = !Array.isArray(result) && !result.subcommands;
  return isLeaf
    ? result
    : Array.isArray(result)
      ? result.map(stripOptions)
      : stripOptions(result);
};

type JsonArgsTarget =
  | { kind: "leaf"; keys: Set<string> }
  | { kind: "group"; name: string }
  | { kind: "unknown" };

/**
 * Classifies the command at `commandPath` for `--jsonArgs` validation, which
 * merges its keys straight onto argv, bypassing yargs' per-command `.strict()`.
 * `--jsonArgs` only makes sense on a specific command, so only a `leaf` is
 * accepted — `group` and `unknown` are rejected by the caller.
 *
 * - `leaf`: a specific command. `keys` is its allow-list — own options plus
 *   those inherited from any enclosing group and the globals. Validating against
 *   the *specific* command (not the union of all commands) matches `.strict()`:
 *   `--jsonArgs '{"dryRun":true}'` is rejected on `auth logout` just as
 *   `--dryRun` would be. Unknown keys — including prototype-polluting ones like
 *   `__proto__` — are never option names.
 * - `group`: a command space (`meticulous agent`) — `--jsonArgs` carries a
 *   single command's options and has nothing to apply to here.
 * - `unknown`: an unknown or empty command path (which yargs also rejects).
 *
 * Every genuinely-runnable command — including the hidden deprecated aliases and
 * `schema` — resolves to a leaf, so no runnable invocation is wrongly rejected.
 */
export const resolveJsonArgsTarget = (
  commandPath: string[],
): JsonArgsTarget => {
  const schema = buildCommandSchema(
    // Every command `main.ts` registers — `CLI_COMMANDS` plus the hidden
    // deprecated aliases and `schema` itself — so the allow-list covers exactly
    // what can be invoked. (generateSchema deliberately uses only `CLI_COMMANDS`
    // for the public, user-facing schema.)
    [...CLI_COMMANDS, ...deprecatedAliases, schemaCommand],
    {},
    true,
  );
  let nodes = schema;
  let node: CommandSchema | undefined;
  for (const token of commandPath) {
    const match = nodes.find(
      (n) => n.command === token || n.aliases?.includes(token),
    );
    // A token that isn't a subcommand is a positional argument — stop at the
    // deepest command matched so far.
    if (!match) {
      break;
    }
    node = match;
    nodes = match.subcommands ?? [];
  }

  if (node?.options) {
    const keys = new Set<string>();
    addOptionKeys(node.options, keys);
    // Positional args are also passable via --jsonArgs (yargs exposes them on
    // argv under their bare name), e.g. `schema --jsonArgs '{"command":[...]}'`.
    for (const positional of node.positionals ?? []) {
      keys.add(positional);
    }
    return { kind: "leaf", keys };
  }
  if (node?.subcommands) {
    return { kind: "group", name: node.command };
  }
  return { kind: "unknown" };
};

// Only canonical option names are accepted via --jsonArgs; aliases are omitted
// deliberately. The merge onto argv sets exactly the key given, and handlers
// read the canonical name — so an alias key would be silently dropped. Rejecting
// it as an unknown option is clearer. (`alias` stays in the schema output for
// discoverability.)
const addOptionKeys = (
  options: Record<string, OptionSchema>,
  keys: Set<string>,
): void => {
  for (const key of Object.keys(options)) {
    keys.add(key);
  }
};

const handler = ({ command }: Options): Promise<void> => {
  printJson(generateSchema(command));
  return Promise.resolve();
};

export const schemaCommand: CommandModule<unknown, Options> = {
  command: "schema [command..]",
  describe: "Output the CLI command schema as JSON (for agent use)",
  builder: {},
  handler: wrapHandler(handler),
};
