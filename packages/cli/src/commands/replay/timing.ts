import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { getLogger } from "loglevel";

export const spans = (context: string) => {
  let totalMsBySpanName: Record<string, number> = {};
  let firstSpanStart: number | undefined = undefined;

  const start = (name: string) => {
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

  const logAll = () => {
    const logger = getLogger(METICULOUS_LOGGER_NAME);
    logger.error(
      `Timing - [${context}] Total time taken by span in ms`,
      totalMsBySpanName
    );
    logger.error(
      `Timing - [${context}] Total time taken in ms`,
      firstSpanStart != null ? performance.now() - firstSpanStart : "unknown"
    );
    totalMsBySpanName = {};
  };

  return { start, logAll };
};
