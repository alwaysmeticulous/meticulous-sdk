import { initLogger } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import {
  BackendRecorderConfig,
  BackendRecorderHandle,
} from "@alwaysmeticulous/sdk-bundles-api";

const MANUAL_INIT_BUNDLE_PATH =
  "backend-record-js/v1/manual-init.bundle.js";

export const initBackendRecorder = async (
  config?: BackendRecorderConfig,
): Promise<BackendRecorderHandle | undefined> => {
  const logger = initLogger();
  logger.debug("Downloading backend recorder bundle...");
  const bundleLocation = await fetchAsset(MANUAL_INIT_BUNDLE_PATH);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).initBackendRecorder(config);
};

export const getBackendRecorderBundlePath = (
  version?: string | null,
): string => {
  const versionFolder =
    version == null ? "v1" : `v/${version}`;
  return `backend-record-js/${versionFolder}/manual-init.bundle.js`;
};
