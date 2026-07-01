import type { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { CliUserError } from "../utils/cli-user-error";

/**
 * Parses the `--rewrites` CLI flag's JSON string into the structured array
 * `AssetUploadMetadata["rewrites"]` expects. Throws a `CliUserError` on
 * malformed input (reported cleanly by the top-level `wrapHandler`).
 */
export const parseRewrites = (
  rewritesString?: string,
): AssetUploadMetadata["rewrites"] => {
  let parsedRewrites: unknown;
  try {
    parsedRewrites = JSON.parse(rewritesString ?? "[]");
  } catch (error) {
    throw new CliUserError(
      "Could not parse --rewrites flag. Expected a valid JSON array string." +
        (error instanceof Error ? ` ${error.message}` : ""),
    );
  }

  if (!Array.isArray(parsedRewrites)) {
    throw new CliUserError(
      "Invalid --rewrites flag. Expected a valid JSON array string.",
    );
  }

  const isValid = parsedRewrites.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.source === "string" &&
      typeof item.destination === "string",
  );

  if (!isValid) {
    throw new CliUserError(
      "Invalid --rewrites flag. Each element in the array must be an object " +
        "with 'source' and 'destination' string properties. See " +
        "https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array for more details.",
    );
  }

  return parsedRewrites as AssetUploadMetadata["rewrites"];
};
