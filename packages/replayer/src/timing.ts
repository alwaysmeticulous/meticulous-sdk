import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { getLogger } from "loglevel";

let totalMsBySpanName: Record<string, number> = {};
let firstSpanStart: number | undefined = undefined;

export const startSpan = (name: string) => {
  // const logger = getLogger("timings");

  const start = performance.now();
  firstSpanStart = firstSpanStart ?? start;
  return {
    finish: () => {
      const end = performance.now();
      const timeTaken = end - start;
      // logger.debug(
      //   `[timing] ${name} took ${timeTaken}ms (start: ${start}, end: ${end})`
      // );
      totalMsBySpanName[name] = totalMsBySpanName[name] ?? 0;
      totalMsBySpanName[name] += timeTaken;
    },
  };
};

export const logAllSpans = () => {
  const logger = getLogger(METICULOUS_LOGGER_NAME);
  logger.error("Total time taken by span in ms", totalMsBySpanName);
  logger.error(
    "Total time taken in ms",
    firstSpanStart != null ? performance.now() - firstSpanStart : "unknown"
  );
  totalMsBySpanName = {};
};
