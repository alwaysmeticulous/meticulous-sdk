export { recordCommand } from "./commands/record/index";
export { replayCommand } from "./commands/replay.command";
export { ciRunLocalCommand } from "./commands/ci/run-local.command";
export { ciStartTunnelCommand } from "./commands/ci/start-tunnel.command";

// Types for authoring custom check plugins. Re-exported so plugin authors can
// import them from the `@alwaysmeticulous/cli` package they already install.
export type {
  Snapshot,
  CustomCheckInput,
  CustomCheckVerdict,
  CustomCheckOutput,
  CustomCheckReport,
  MarkdownReport,
  CustomCheck,
  CustomCheckPluginManifest,
  PluginManifest,
  NetworkRequestSnapshotData,
} from "@alwaysmeticulous/api";
export {
  NETWORK_REQUESTS_SNAPSHOT_TYPE,
  CUSTOM_CHECK_SUMMARY_MAX_LENGTH,
} from "@alwaysmeticulous/api";
