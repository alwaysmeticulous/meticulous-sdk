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
      options: <T extends { [key: string]: Options }>(options: T) => ({
        handler: (
          unwrappedHandler: (
            args: ArgumentsCamelCase<InferredOptionTypes<T>>
          ) => Promise<void>
        ): CommandModule<unknown, InferredOptionTypes<T>> => ({
          command,
          ...details,
          builder: options as { [key: string]: Options },
          handler: wrapHandler(unwrappedHandler),
        }),
      }),
    }),
  };
};
