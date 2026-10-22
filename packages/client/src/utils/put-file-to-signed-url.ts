import { createReadStream } from "fs";
import { sendToSignedUrl } from "./send-to-signed-url";

export interface PutFileToSignedUrlOptions {
  filePath: string;
  signedUrl: string;
  size: number;
  contentType: string;
}

/**
 * Streams `filePath` to `signedUrl` via an HTTPS PUT. Streaming avoids
 * relying on `fetch`'s `duplex: "half"` support, which is fragile across
 * Node 18.x patch versions.
 */
export const putFileToSignedUrl = ({
  filePath,
  signedUrl,
  size,
  contentType,
}: PutFileToSignedUrlOptions): Promise<void> =>
  sendToSignedUrl({
    signedUrl,
    headers: { "Content-Length": size, "Content-Type": contentType },
    writeBody: (request) =>
      new Promise((resolve, reject) => {
        // A new read stream is required on every attempt — streams cannot be replayed.
        const fileStream = createReadStream(filePath);
        fileStream.on("error", reject);
        fileStream.on("end", () => resolve());
        fileStream.pipe(request);
      }),
  });
