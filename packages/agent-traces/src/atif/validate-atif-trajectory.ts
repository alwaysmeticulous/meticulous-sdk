import type { AtifTrajectory } from "../types/atif.types";
import { asArray, asNonEmptyString, asRecord } from "../utils/json-guards";

export type AtifValidationResult =
  | { trajectory: AtifTrajectory; error: null }
  | { trajectory: null; error: string };

const STEP_SOURCES = new Set(["system", "user", "agent"]);

/**
 * Checks the parts of an ATIF document that conversion, stats and tool output
 * exclusion rely on, so a third-party trajectory can be handled like ours.
 */
export const validateAtifTrajectory = (
  value: unknown,
): AtifValidationResult => {
  const record = asRecord(value);
  const schemaVersion = asNonEmptyString(record?.["schema_version"]);
  if (!record || !schemaVersion?.startsWith("ATIF-")) {
    return invalid('schema_version must be a string starting "ATIF-"');
  }
  const error = findTrajectoryError(record, "");
  return error
    ? invalid(error)
    : { trajectory: record as unknown as AtifTrajectory, error: null };
};

const findTrajectoryError = (
  record: Record<string, unknown>,
  path: string,
): string | null => {
  if (!asNonEmptyString(asRecord(record["agent"])?.["name"])) {
    return `${path}agent.name must be a non-empty string`;
  }
  const steps = asArray(record["steps"]);
  if (!steps) {
    return `${path}steps must be an array`;
  }
  for (const [index, step] of steps.entries()) {
    const error = findStepError(step, `${path}steps[${index}]`);
    if (error) {
      return error;
    }
  }
  const subagents = record["subagent_trajectories"];
  if (subagents === undefined) {
    return null;
  }
  if (!Array.isArray(subagents)) {
    return `${path}subagent_trajectories must be an array`;
  }
  for (const [index, subagent] of subagents.entries()) {
    const subagentPath = `${path}subagent_trajectories[${index}]`;
    const subagentRecord = asRecord(subagent);
    const error = subagentRecord
      ? findTrajectoryError(subagentRecord, `${subagentPath}.`)
      : `${subagentPath} must be an object`;
    if (error) {
      return error;
    }
  }
  return null;
};

const findStepError = (value: unknown, path: string): string | null => {
  const step = asRecord(value);
  if (!step) {
    return `${path} must be an object`;
  }
  if (typeof step["step_id"] !== "number") {
    return `${path}.step_id must be a number`;
  }
  if (!STEP_SOURCES.has(step["source"] as string)) {
    return `${path}.source must be "system", "user" or "agent"`;
  }
  const message = step["message"];
  if (typeof message !== "string" && !Array.isArray(message)) {
    return `${path}.message must be a string or an array`;
  }
  if (!isArrayOf(step["tool_calls"], isToolCall)) {
    return `${path}.tool_calls must be an array of calls with a tool_call_id and function_name`;
  }
  const observation = step["observation"];
  if (
    observation !== undefined &&
    !isArrayOf(asRecord(observation)?.["results"] ?? null, isObject)
  ) {
    return `${path}.observation.results must be an array of objects`;
  }
  return null;
};

/** Undefined (absent) counts as valid. */
const isArrayOf = (
  value: unknown,
  isItem: (item: unknown) => boolean,
): boolean =>
  value === undefined || (Array.isArray(value) && value.every(isItem));

const isObject = (value: unknown): boolean => asRecord(value) !== null;

const isToolCall = (value: unknown): boolean => {
  const call = asRecord(value);
  return (
    typeof call?.["tool_call_id"] === "string" &&
    typeof call["function_name"] === "string"
  );
};

const invalid = (error: string): AtifValidationResult => ({
  trajectory: null,
  error,
});
