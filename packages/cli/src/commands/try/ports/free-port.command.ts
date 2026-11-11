import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import { printResult } from "../shared/helper-options";
import { findFreePorts } from "./find-free-ports";

const MAX_PORTS = 10;

interface Options {
  count: number;
  json: boolean;
}

const handler = async (options: Options): Promise<void> => {
  const ports = await findFreePorts(options.count);
  printResult(options.json, { ports }, () => ports.map(String));
};

export const freePortCommand: CommandModule<unknown, Options> = {
  command: "free-port",
  describe:
    "Print free local TCP ports, one per line, for the app server and recording browsers. Use these instead of fixed ports so concurrent trials don't collide",
  builder: {
    count: {
      number: true,
      default: 1,
      description: `How many distinct ports (1-${MAX_PORTS})`,
      coerce: (value: number): number => {
        if (!Number.isInteger(value) || value < 1 || value > MAX_PORTS) {
          throw new CliUserError(
            `--count must be an integer between 1 and ${MAX_PORTS}.`,
          );
        }
        return value;
      },
    },
    json: {
      boolean: true,
      default: false,
      description: "Output the result as JSON on stdout",
    },
  },
  handler: wrapHandler(handler),
};
