import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { compileRegex } from "./compile-regex";

export const getTracesUserConfigPath = (): string =>
  join(homedir(), ".meticulous", "traces-config.json");

/**
 * Per-user preferences, read from ~/.meticulous/traces-config.json. Owned by
 * the developer rather than MDM, so the uploader's `install` never writes it.
 *
 * To add a setting: add it here and to `FIELDS`, then read it in
 * `buildConfig`.
 */
export interface TracesUserConfig {
  /** false stops all uploads for this user; the uploader stays installed. */
  enabled: boolean;
  /**
   * When set, only sessions whose git repository (`host/owner/repo`) it
   * matches are uploaded. Sessions outside a repository are skipped.
   */
  allowedRepoRegex: RegExp | null;
  /**
   * When set, the output of every call to a tool whose name it matches is
   * replaced before upload; the call and its arguments are kept.
   */
  excludeToolOutputRegex: RegExp | null;
}

export interface LoadedTracesUserConfig {
  config: TracesUserConfig;
  /** Human-readable reasons any part of the file was ignored. */
  problems: string[];
}

interface FieldSpec<T> {
  defaultValue: T;
  /** Returns undefined when the value has the wrong shape. */
  parse: (value: unknown) => T | undefined;
}

const parseNullableRegex = (value: unknown): RegExp | null | undefined =>
  value === null ? null : compileRegex(value);

const FIELDS: {
  [K in keyof TracesUserConfig]: FieldSpec<TracesUserConfig[K]>;
} = {
  enabled: {
    defaultValue: true,
    parse: (value) => (typeof value === "boolean" ? value : undefined),
  },
  allowedRepoRegex: {
    defaultValue: null,
    parse: parseNullableRegex,
  },
  excludeToolOutputRegex: {
    defaultValue: null,
    parse: parseNullableRegex,
  },
};

export const loadTracesUserConfig = (
  path: string = getTracesUserConfigPath(),
): LoadedTracesUserConfig => {
  let contents: string | null;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return invalidFile(`unreadable (${String(error)})`);
    }
    contents = null;
  }
  return parseTracesUserConfig(contents);
};

/** `contents` is null when the file doesn't exist. */
export const parseTracesUserConfig = (
  contents: string | null,
): LoadedTracesUserConfig => {
  if (contents === null) {
    return { config: buildDefaultConfig(), problems: [] };
  }
  const record = parseRecord(contents);
  if (!record) {
    return invalidFile("not a JSON object");
  }
  const problems: string[] = [];
  const config = buildConfig((key) => readField(key, record[key], problems));
  return {
    // Someone who wrote this file most likely did so to restrict uploads, so
    // a setting we can't honour stops them all.
    config: problems.length > 0 ? { ...config, enabled: false } : config,
    problems,
  };
};

type FieldResolver = <K extends keyof TracesUserConfig>(
  key: K,
) => TracesUserConfig[K];

const buildConfig = (resolve: FieldResolver): TracesUserConfig => ({
  enabled: resolve("enabled"),
  allowedRepoRegex: resolve("allowedRepoRegex"),
  excludeToolOutputRegex: resolve("excludeToolOutputRegex"),
});

const buildDefaultConfig = (): TracesUserConfig =>
  buildConfig((key) => FIELDS[key].defaultValue);

const invalidFile = (problem: string): LoadedTracesUserConfig => ({
  config: { ...buildDefaultConfig(), enabled: false },
  problems: [problem],
});

const readField = <K extends keyof TracesUserConfig>(
  key: K,
  raw: unknown,
  problems: string[],
): TracesUserConfig[K] => {
  const spec: FieldSpec<TracesUserConfig[K]> = FIELDS[key];
  if (raw === undefined) {
    return spec.defaultValue;
  }
  const parsed = spec.parse(raw);
  if (parsed === undefined) {
    problems.push(`"${key}" has an invalid value: ${JSON.stringify(raw)}`);
    return spec.defaultValue;
  }
  return parsed;
};

const parseRecord = (contents: string): Record<string, unknown> | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
};
