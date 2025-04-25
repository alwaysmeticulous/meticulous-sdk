export interface AssetUploadMetadata {
  /**
   * A set of rewrite rules following the sytax here:
   * https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array
   */
  rewrites: {
    source: string;
    destination: string;
  }[];
}
