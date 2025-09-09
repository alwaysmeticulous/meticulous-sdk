/**
 * Information about companion assets to serve _together_ with a deployment. Note this
 * is distinct from a static assets deployment, which is _just_ static assets.
 */
export interface CompanionAssetsInfo {
  /**
   * The upload ID of the deployment to serve the companion assets from.
   */
  deploymentUploadId: string;

  /**
   * A regex to match to determine if a path should be served from the companion assets.
   */
  regex: string;
}
