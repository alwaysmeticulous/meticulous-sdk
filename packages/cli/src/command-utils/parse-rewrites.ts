import type { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";

/**
 * Parses the `--rewrites` CLI flag's JSON string into the structured array
 * `AssetUploadMetadata["rewrites"]` expects. Exits the process with a clear
 * error message on malformed input rather than throwing.
 */
export const parseRewrites = (
  rewritesString?: string,
): AssetUploadMetadata["rewrites"] => {
  const logger = initLogger();
  let parsedRewrites: unknown;
  try {
    parsedRewrites = JSON.parse(rewritesString ?? "[]");
  } catch (error) {
    logger.error(
      "Error: Could not parse --rewrites flag. Expected a valid JSON array string.",
    );
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }

  if (!Array.isArray(parsedRewrites)) {
    logger.error(
      "Error: Invalid --rewrites flag. Expected a valid JSON array string.",
    );
    process.exit(1);
  }

  const isValid = parsedRewrites.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.source === "string" &&
      typeof item.destination === "string",
  );

  if (!isValid) {
    logger.error(
      "Error: Invalid --rewrites flag. Each element in the array must be an object with 'source' and 'destination' string properties.",
    );
    logger.error(
      "See https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array for more details.",
    );
    process.exit(1);
  }

  return parsedRewrites as AssetUploadMetadata["rewrites"];
};
