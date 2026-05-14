import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";

const AUTO_INIT_BUNDLE_PATH =
  "backend-record-js/v1/auto-init.bundle.js";

const autoInit = async () => {
  const bundleLocation = await fetchAsset(AUTO_INIT_BUNDLE_PATH);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(bundleLocation);
};

autoInit().catch((error) => {
  console.error(
    "[meticulous] Error while bootstrapping backend recorder!",
  );
  console.error(error);
});
