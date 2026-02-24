/**
 * Type of asset bundle used for static and companion asset deployments.
 *
 * zip: regular zip file.
 *
 * tar.d: tarball, further compressed using the (raw) deflate algorithm.
 *        this nonstandard format was chosen because it achieved the best
 *        benchmark results for round-robbin compression -> upload ->
 *        download -> decompression.
 */
export type DeploymentArchiveType = "zip" | "tar.d";
