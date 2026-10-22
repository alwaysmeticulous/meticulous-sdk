import type { AtifTrajectory } from "../../types/atif.types";
import { titleFromPrompt } from "../../atif/title-from-prompt";
import type { JsonRecord } from "../../utils/json-guards";
import { asNonEmptyString } from "../../utils/json-guards";

/** OpenCode's placeholder until it has generated a title. */
const DEFAULT_TITLE_REGEX =
  /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const resolveSessionTitle = (
  info: JsonRecord,
  trajectory: AtifTrajectory,
): string | null => {
  const title = asNonEmptyString(info["title"]);
  if (title && !DEFAULT_TITLE_REGEX.test(title)) {
    return title;
  }
  const firstPrompt = trajectory.steps.find(
    (step) =>
      step.source === "user" &&
      step.extra?.["origin_kind"] === undefined &&
      step.extra?.["is_compact_summary"] !== true,
  );
  return typeof firstPrompt?.message === "string"
    ? titleFromPrompt(firstPrompt.message)
    : null;
};
