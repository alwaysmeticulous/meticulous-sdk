import type { TestRunStatus } from "@alwaysmeticulous/api";
import { printJson } from "../../command-utils/print-json";

export type CiSkipReason =
  | "comments_disabled_for_author"
  | "all_sessions_excluded"
  | "nothing_to_test"
  | "dry_run";

export type CiFailureReason =
  | "usage"
  | "auth"
  | "environment"
  | "cli_out_of_date"
  | "remote"
  | "unexpected";

export type CiCommandResult =
  | {
      outcome: "success";
      testRunId: string;
      status: TestRunStatus | null;
    }
  | {
      outcome: "skipped";
      reason: CiSkipReason;
      message: string;
      testRunId: null;
      status: null;
    }
  | {
      outcome: "failed";
      reason: CiFailureReason;
      message: string;
    };

export const CI_JSON_OPTION = {
  boolean: true,
  default: false,
  description:
    "Output one machine-readable JSON result on stdout. Progress, notices, and errors remain on stderr.",
} as const;

const STRUCTURED_CI_COMMANDS = new Set([
  "upload-assets",
  "upload-container",
  "run-with-uploaded-asset-chunks",
]);

const JSON_ARGS_OPTION = /^(?:--jsonArgs|--rawJson)(?:=(.*))?$/;

const jsonArgsRequestsJson = (raw: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === "object" &&
      parsed != null &&
      !Array.isArray(parsed) &&
      (parsed as { json?: unknown }).json === true
    );
  } catch {
    return false;
  }
};

export const isStructuredCiJsonInvocation = (
  args: readonly string[],
): boolean => {
  const ciIndex = args.indexOf("ci");
  if (ciIndex < 0 || !STRUCTURED_CI_COMMANDS.has(args[ciIndex + 1] ?? "")) {
    return false;
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--json" || /^--json=(?:true|1)$/.test(arg)) {
      return true;
    }
    const match = JSON_ARGS_OPTION.exec(arg);
    if (!match) {
      continue;
    }
    const raw = match[1] ?? args[i + 1];
    if (raw != null && !raw.startsWith("-") && jsonArgsRequestsJson(raw)) {
      return true;
    }
  }
  return false;
};

export const printStructuredCiFailure = (
  message: string,
  reason: CiFailureReason = "usage",
): void => {
  printJson({ outcome: "failed", reason, message });
};
