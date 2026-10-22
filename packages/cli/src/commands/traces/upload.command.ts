import { FILE_TRACE_AGENTS } from "@alwaysmeticulous/agent-traces";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import type { TracesUploadOptions } from "./upload/run-traces-upload";
import { runTracesUpload } from "./upload/run-traces-upload";

export const tracesUploadCommand: CommandModule<unknown, TracesUploadOptions> =
  {
    command: "upload <paths..>",
    describe:
      "Upload coding-agent session traces you already have: Claude Code, Codex, Cursor and Pi transcripts, `opencode export` files, and ATIF trajectories from any harness. Each path is a file or a directory to search. Formats are detected from file contents, and a session's subagent transcripts next to it are included.",
    builder: {
      paths: {
        string: true,
        array: true,
        demandOption: true,
        description: "Trace files, or directories to search for them",
      },
      apiToken: {
        ...OPTIONS.apiToken,
        description:
          "Meticulous API token. When omitted, uses your login, signing in if needed.",
      },
      project: {
        string: true,
        description:
          "The project (id, 'org/proj', or 'proj') whose organization the traces are uploaded to. When signed in, defaults to your default project; ignored with a project API token.",
      },
      agent: {
        string: true,
        choices: FILE_TRACE_AGENTS,
        description:
          "Treat every file as this agent's format instead of detecting it. Use 'other' for ATIF trajectories.",
      },
      excludeToolOutputRegex: {
        string: true,
        array: true,
        description:
          "Replace the output of every call to a tool whose name matches before uploading. Repeatable; excludeToolOutputRegex in ~/.meticulous/traces-config.json also applies.",
      },
      dryRun: {
        boolean: true,
        default: false,
        description: "Find and convert the traces without uploading them",
      },
      outputDir: {
        string: true,
        description:
          "With --dryRun, write each session's ATIF trajectory, raw files and summary under this directory",
      },
      force: {
        boolean: true,
        default: false,
        description:
          "Upload sessions even if Meticulous already has identical content for them",
      },
      json: {
        boolean: true,
        default: false,
        description: "Print the results as JSON",
      },
    },
    handler: wrapHandler(runTracesUpload),
  };
