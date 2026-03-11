import { CommandModule, Options as YargsOptions } from "yargs";
import { wrapHandler } from "../command-utils/sentry.utils";
import { authCommand } from "./auth/index";
import { ciCommand } from "./ci/index";
import { downloadCommand } from "./download/index";
import { projectCommand } from "./project/index";
import { recordCommand } from "./record/index";
import { replayCommand } from "./replay.command";

interface OptionSchema {
  type?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  choices?: unknown[];
  hidden?: boolean;
}

interface CommandSchema {
  command: string;
  describe: string;
  options?: Record<string, OptionSchema>;
  subcommands?: CommandSchema[];
}

interface Options {
  command?: string[];
}

const GLOBAL_OPTIONS: Record<string, OptionSchema> = {
  logLevel: {
    type: "string",
    description: "Log level",
    choices: ["trace", "debug", "info", "warn", "error", "silent"],
  },
  dataDir: {
    type: "string",
    description: "Where Meticulous stores data (sessions, replays, etc.)",
  },
  rawJson: {
    type: "string",
    description:
      "Pass all options as a JSON string (for agent/programmatic use)",
  },
};

const ALL_COMMANDS: CommandModule<unknown, any>[] = [
  authCommand,
  ciCommand,
  downloadCommand,
  projectCommand,
  recordCommand,
  replayCommand,
];

const buildCommandSchema = (commands: CommandModule[]): CommandSchema[] => {
  return commands
    .filter((cmd) => cmd.describe !== false)
    .map(commandModuleToSchema);
};

const commandModuleToSchema = (cmd: CommandModule): CommandSchema => {
  const rawCommand = Array.isArray(cmd.command)
    ? cmd.command[0]
    : (cmd.command ?? "");
  const name = (rawCommand as string).split(" ")[0];
  const describe = typeof cmd.describe === "string" ? cmd.describe : "";

  if (typeof cmd.builder === "function") {
    const submodules: CommandModule[] = [];
    const mockYargs = createMockYargs(submodules);
    (cmd.builder as (y: unknown) => unknown)(mockYargs);
    return {
      command: name,
      describe,
      subcommands: buildCommandSchema(submodules),
    };
  }

  if (cmd.builder && typeof cmd.builder === "object") {
    const options: Record<string, OptionSchema> = { ...GLOBAL_OPTIONS };
    for (const [key, opt] of Object.entries(
      cmd.builder as Record<string, YargsOptions>,
    )) {
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
      options[key] = schema;
    }
    return { command: name, describe, options };
  }

  return { command: name, describe };
};

const createMockYargs = (captured: CommandModule[]): unknown => {
  const mock: Record<string, unknown> = {};
  const fluent = () => mock;
  mock.command = (module: CommandModule) => {
    captured.push(module);
    return mock;
  };
  mock.demandCommand = fluent;
  mock.help = fluent;
  mock.option = fluent;
  mock.options = fluent;
  mock.strict = fluent;
  mock.positional = fluent;
  mock.usage = fluent;
  mock.epilog = fluent;
  mock.example = fluent;
  return mock;
};

const findInSchema = (
  nodes: CommandSchema[],
  pathSegments: string[],
): CommandSchema | CommandSchema[] => {
  if (pathSegments.length === 0) {
    return nodes;
  }
  const [head, ...rest] = pathSegments;
  const match = nodes.find((n) => n.command === head);
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

const stripOptions = (
  node: CommandSchema,
): Omit<CommandSchema, "options"> => ({
  command: node.command,
  describe: node.describe,
  ...(node.subcommands
    ? { subcommands: node.subcommands.map(stripOptions) }
    : {}),
});

const handler = async ({ command }: Options): Promise<void> => {
  const schema = buildCommandSchema(ALL_COMMANDS);
  const result =
    command && command.length > 0 ? findInSchema(schema, command) : schema;

  const isLeaf = !Array.isArray(result) && !result.subcommands;
  const output = isLeaf ? result : Array.isArray(result)
    ? result.map(stripOptions)
    : stripOptions(result);

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
};

export const schemaCommand: CommandModule<unknown, Options> = {
  command: "schema [command..]",
  describe: "Output the CLI command schema as JSON (for agent use)",
  builder: {},
  handler: wrapHandler(handler),
};
