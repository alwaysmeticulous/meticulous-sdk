export const EXCLUDED_TOOL_OUTPUT =
  "[OMITTED: tool output excluded by excludeToolOutputRegex]";

export interface ToolCallReference {
  names?: Array<string | null | undefined>;
  callId?: string | null;
}

export interface ToolOutputFilter {
  isExcluded: (call: ToolCallReference) => boolean;
}

/** `excludedCallIds` are the calls the ATIF names an excluded tool for. */
export const createToolOutputFilter = (
  regexes: RegExp[],
  excludedCallIds: ReadonlySet<string>,
): ToolOutputFilter => ({
  isExcluded: ({ names = [], callId }) =>
    (!!callId && excludedCallIds.has(callId)) ||
    names.some((name) => !!name && matchesAny(regexes, name)),
});

export const matchesAny = (regexes: RegExp[], name: string): boolean =>
  regexes.some((regex) => regex.test(name));
