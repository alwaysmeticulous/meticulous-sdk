import { createReadStream } from "fs";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { getProxyAgent } from "./get-proxy-agent";
import { UploadError } from "./retry-transient-upload-errors";

export interface PutFileToSignedUrlOptions {
  filePath: string;
  signedUrl: string;
  size: number;
  contentType: string;
}

/**
 * Streams `filePath` to `signedUrl` via an HTTPS PUT.
 *
 * Uses Node's built-in `https.request` rather than `fetch` so that we
 * (a) honour `HTTPS_PROXY` via `getProxyAgent()` for customers behind
 * corporate proxies and (b) avoid relying on `fetch`'s `duplex: "half"`
 * streaming support, which is fragile across Node 18.x patch versions.
 *
 * Rejects with `UploadError` for non-200 responses so callers can pair
 * this with `retryTransientUploadErrors`.
 */
export const putFileToSignedUrl = async ({
  filePath,
  signedUrl,
  size,
  contentType,
}: PutFileToSignedUrlOptions): Promise<void> => {
  return new Promise((resolve, reject) => {
    // A new read stream is required on every attempt — streams cannot be replayed.
    const fileStream = createReadStream(filePath);
    const req = httpsRequest(
      signedUrl,
      {
        agent: getProxyAgent(),
        method: "PUT",
        headers: {
          "Content-Length": size,
          "Content-Type": contentType,
        },
      },
      (response: IncomingMessage) => {
        let responseData = "";

        response.on("data", (chunk) => {
          responseData += chunk;
        });

        response.on("end", () => {
          if (response.statusCode === 200) {
            resolve();
          } else {
            reject(new UploadError(response.statusCode ?? 0, responseData));
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(error);
    });

    fileStream.on("error", (error) => {
      req.destroy(error);
      reject(error);
    });

    fileStream.pipe(req);
  });
};
