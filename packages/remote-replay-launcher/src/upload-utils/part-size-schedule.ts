const MiB = 1024 * 1024;

/**
 * The backend rejects an upload that has more than this many parts (both in
 * `request-upload-part` and when completing the upload), and S3 allows at most
 * 10,000. Do not rely on the backend limit being raised.
 */
export const MAX_UPLOAD_PARTS = 100;

/**
 * Small parts first so that uploading starts as soon as compression has
 * produced a few MiB, then progressively larger parts (up to the part size the
 * server suggests) so the 100-part limit still allows a large archive. S3 only
 * needs every part but the last to be at least 5MiB, and parts of different
 * sizes are fine.
 */
const RAMP: ReadonlyArray<{ partSize: number; parts: number }> = [
  { partSize: 8 * MiB, parts: 8 },
  { partSize: 16 * MiB, parts: 8 },
  { partSize: 32 * MiB, parts: 8 },
];

/**
 * Size of the given (1-based) part. `serverPartSize` is the largest part the
 * server expects (50MiB at the time of writing) and is used from the end of
 * the ramp onwards.
 */
export const getPartSize = (
  partNumber: number,
  serverPartSize: number,
): number => {
  let remaining = partNumber - 1;
  for (const { partSize, parts } of RAMP) {
    if (remaining < parts) {
      return Math.min(partSize, serverPartSize);
    }
    remaining -= parts;
  }
  return serverPartSize;
};

/**
 * Largest compressed archive that fits in MAX_UPLOAD_PARTS parts. With a 50MiB
 * server part size: 8x8 + 8x16 + 8x32 + 76x50 = 4,248MiB (~4.1GiB), 85% of the
 * 5,000MiB (100 x 50MiB) a fixed-size schedule allows.
 */
export const getMaxArchiveBytes = (serverPartSize: number): number =>
  Array.from({ length: MAX_UPLOAD_PARTS }, (_, i) =>
    getPartSize(i + 1, serverPartSize),
  ).reduce((total, size) => total + size, 0);
