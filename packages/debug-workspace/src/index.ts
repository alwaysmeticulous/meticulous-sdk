export type { DebugContext, ReplayDiffInfo } from "./debug.types";
export {
  DEBUG_DATA_DIRECTORY,
  DEBUG_SESSIONS_DIR_NAME,
  getDebugSessionsDir,
} from "./debug-constants";
export {
  resolveDebugContext,
  type ResolveDebugContextOptions,
} from "./resolve-debug-context";
export {
  downloadDebugData,
  type DownloadDebugDataOptions,
} from "./download-debug-data";
export {
  generateDebugWorkspace,
  defaultWriteContextJson,
  type GenerateDebugWorkspaceOptions,
  type FileMetadataEntry,
  type ScreenshotMapEntry,
  type ReplayComparisonEntry,
  type WriteContextJson,
  type WriteContextJsonArgs,
} from "./generate-debug-workspace";
export {
  fetchDomDiffs,
  type DomDiffMap,
  type DomDiffMapEntry,
  type FetchDomDiffsOptions,
} from "./fetch-dom-diffs";
export type {
  InvestigationFocus,
  InvestigationKind,
  FocusScreenshot,
  SidecarRef,
} from "./focus.types";
export {
  computeInvestigationFocus,
  MAX_FOCUS_SCREENSHOTS,
  NEIGHBOR_EVENT_RADIUS,
} from "./compute-investigation-focus";
export {
  splitMapsForFocus,
  type SplitMapsArgs,
  type SplitMapsResult,
  SCREENSHOT_INDEX_SIDECAR_FILENAME,
  DOM_DIFF_INDEX_SIDECAR_FILENAME,
} from "./split-maps-for-focus";
export { extractScreenshotDomFiles } from "./extract-screenshot-dom-files";
export { runDebugPipeline, type DebugPipelineOptions } from "./pipeline";
