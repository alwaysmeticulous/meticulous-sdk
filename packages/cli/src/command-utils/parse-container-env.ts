import type { ContainerEnvVariable } from "@alwaysmeticulous/client";
import { CliUserError } from "../utils/cli-user-error";

/**
 * Parses repeated `--containerEnv name=value` CLI flags into the structured
 * array the API expects. Throws a `CliUserError` on malformed input (reported
 * cleanly by the top-level `wrapHandler`). Shared by `agent upload-build` and
 * the deprecated `ci upload-container`.
 */
export const parseContainerEnv = (value: string[]): ContainerEnvVariable[] =>
  value.map((v) => {
    const [name, ...rest] = v.split("=");
    const envValue = rest.join("=");
    if (!name || !envValue) {
      throw new CliUserError(
        `Invalid environment variable: "${v}". Expected the form name=value.`,
      );
    }
    return { name, value: envValue };
  });
