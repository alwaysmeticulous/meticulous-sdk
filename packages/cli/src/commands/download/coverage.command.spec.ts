import { describe, expect, it } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
import { downloadCoverageCommand } from "./coverage.command";

const parse = (argv: string[]) =>
  yargs(argv)
    .options(downloadCoverageCommand.builder as Record<string, YargsOptions>)
    .fail((message) => {
      throw new Error(message);
    })
    .parse();

describe("download coverage", () => {
  // yargs treats an option as present once it has a value, including
  // latestForProject's default of false. A conflicts entry against
  // --testRunId would reject every explicit selector before the handler runs.
  it.each([
    [[]],
    [["--testRunId", "tr-1"]],
    [["--commitSha", "abc"]],
    [["--prNumber", "12"]],
    [["--latestForProject"]],
  ])("parses %j", (argv) => {
    expect(() => parse(argv)).not.toThrow();
  });

  it("still rejects two run selectors", () => {
    expect(() => parse(["--testRunId", "tr-1", "--prNumber", "12"])).toThrow(
      /mutually exclusive/,
    );
  });
});
