import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { CliUserError } from "../../../utils/cli-user-error";

export type UploadMode = "assets" | "container";

/**
 * Auto-detects the upload mode from the provided inputs: a `localImageTag`
 * selects container mode, `appDirectory`/`appZip` select asset mode. Throws a
 * `CliUserError` when neither or both are provided.
 */
export const detectUploadMode = ({
  localImageTag,
  appDirectory,
  appZip,
}: {
  localImageTag?: string | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
}): UploadMode => {
  const hasContainer = Boolean(localImageTag);
  const hasAssets = Boolean(appDirectory || appZip);

  if (hasContainer && hasAssets) {
    throw new CliUserError(
      "Provide either container input (--localImageTag) or asset input " +
        "(--appDirectory/--appZip), not both.",
    );
  }
  if (!hasContainer && !hasAssets) {
    throw new CliUserError(
      "No upload input provided. Pass --localImageTag for a container, or " +
        "--appDirectory/--appZip for static assets.",
    );
  }

  return hasContainer ? "container" : "assets";
};

/**
 * Parses the `--rewrites` JSON array string into the rewrite rules accepted by
 * the asset upload. Throws a `CliUserError` on malformed input.
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
