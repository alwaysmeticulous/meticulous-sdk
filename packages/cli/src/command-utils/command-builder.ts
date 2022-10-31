import {
  ArgumentsCamelCase,
  CommandModule,
  InferredOptionTypes,
  Options,
} from "yargs";
import { wrapHandler } from "../utils/sentry.utils";

export const buildCommand = (command: string) => {
  return {
    details: (
      details: Omit<CommandModule, "command" | "builder" | "handler">
    ) => ({
      options: <O extends { [key: string]: Options }>(options: O) => ({
        handler: (
          unwrappedHandler: (
            args: ArgumentsCamelCase<InferredOptionTypes<O>>
          ) => Promise<void>
        ): CommandModule<unknown, InferredOptionTypes<O>> => ({
          command,
          ...details,
          builder: options,
          handler: wrapHandler(unwrappedHandler),
        }),
      }),
    }),
  };
};
