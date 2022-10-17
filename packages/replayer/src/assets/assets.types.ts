export interface AssetSnapshotsData {
  assetSnapshots: AssetSnapshot[];

  /** Base URL of the page that the assets were loaded relative to */
  baseUrl: string;
}

export interface AssetSnapshot {
  url: string;
  contentType: string;
  getData: () => Promise<Buffer>;
}
