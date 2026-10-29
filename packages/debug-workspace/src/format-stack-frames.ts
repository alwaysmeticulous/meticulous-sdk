interface StackFrame {
  functionName?: string;
  file: string;
  line: number;
  column: number;
  resolved?: boolean;
  isElided?: boolean;
}

/**
 * The first frames of a timeline error entry's stack: its `mappedStack`, or
 * its raw `nativeStack` when it was never source-mapped (unhandled promise
 * rejections never are).
 */
export const formatErrorStackFrames = (
  data: Record<string, unknown>,
  count: number,
): string[] => {
  const mapped = formatStackFrames(data.mappedStack, count);
  return mapped.length > 0
    ? mapped
    : formatNativeStackFrames(data.nativeStack, count);
};

/**
 * The first frames of a timeline error's `mappedStack`, preferring frames
 * that were source-mapped back to the app's source files.
 */
const formatStackFrames = (mappedStack: unknown, count: number): string[] => {
  if (!Array.isArray(mappedStack)) {
    return [];
  }
  const frames = mappedStack.filter(
    (frame): frame is StackFrame =>
      frame != null &&
      typeof frame === "object" &&
      !(frame as StackFrame).isElided,
  );
  const resolved = frames.filter((frame) => frame.resolved !== false);
  return (resolved.length > 0 ? resolved : frames)
    .slice(0, count)
    .map(
      (frame) =>
        `at ${frame.functionName ? `${frame.functionName} ` : ""}(${frame.file}:${frame.line}:${frame.column})`,
    );
};

// Raw frames point into the bundled assets, not the app's source files.
const formatNativeStackFrames = (
  nativeStack: unknown,
  count: number,
): string[] => {
  if (typeof nativeStack !== "string") {
    return [];
  }
  return nativeStack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, count)
    .map((line) => `${line} [unmapped]`);
};
