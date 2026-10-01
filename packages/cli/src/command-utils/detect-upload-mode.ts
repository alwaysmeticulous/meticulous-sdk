import { CliUserError } from "../utils/cli-user-error";

export type UploadMode = "assets" | "container";

/**
 * Auto-detects the upload mode from the provided inputs: a `localImageTag`
 * selects container mode, `appDirectory`/`appZip` select asset mode. Throws a
 * `CliUserError` when neither or both are provided. `assetFlags` names the
 * asset flags the calling command accepts, so the error only suggests those.
 */
export const detectUploadMode = (
  {
    localImageTag,
    appDirectory,
    appZip,
  }: {
    localImageTag?: string | undefined;
    appDirectory?: string | undefined;
    appZip?: string | undefined;
  },
  assetFlags: readonly string[] = ["--appDirectory", "--appZip"],
): UploadMode => {
  const hasContainer = Boolean(localImageTag);
  const hasAssets = Boolean(appDirectory || appZip);
  const assetFlagList = assetFlags.join("/");

  if (hasContainer && hasAssets) {
    throw new CliUserError(
      "Provide either container input (--localImageTag) or asset input " +
        `(${assetFlagList}), not both.`,
    );
  }
  if (!hasContainer && !hasAssets) {
    throw new CliUserError(
      "No upload input provided. Pass --localImageTag for a container, or " +
        `${assetFlagList} for static assets.`,
    );
  }

  return hasContainer ? "container" : "assets";
};
