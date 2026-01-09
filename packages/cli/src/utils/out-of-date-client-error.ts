import { OutOfDateClientError } from "@alwaysmeticulous/sdk-bundles-api";

export const isOutOfDateClientError = (
  error: unknown,
): error is OutOfDateClientError => {
  return (error as Error).name === "OutOfDateClient";
};

export class OutOfDateCLIError extends Error {
  constructor() {
    super(
      "The version of @alwaysmeticulous/cli you are using is out of date. Please update to the latest version, using npm or yarn, and try again.",
    );
    this.name = "OutOfDateCLI";
  }
}
