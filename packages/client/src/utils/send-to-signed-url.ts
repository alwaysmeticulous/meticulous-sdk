import type { ClientRequest, IncomingMessage } from "http";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { getProxyAgent } from "./get-proxy-agent";
import { UploadError } from "./retry-transient-upload-errors";

export interface SendToSignedUrlOptions {
  signedUrl: string;
  headers: Record<string, string | number>;
  /** Writes the body and ends the request; rejects to abort it. */
  writeBody: (request: ClientRequest) => Promise<void>;
}

/**
 * PUTs to `signedUrl` with Node's `https.request` rather than `fetch`, so
 * that `HTTPS_PROXY` is honoured via `getProxyAgent()` for customers behind
 * corporate proxies. Rejects with `UploadError` for non-200 responses so
 * callers can pair this with `retryTransientUploadErrors`.
 */
export const sendToSignedUrl = ({
  signedUrl,
  headers,
  writeBody,
}: SendToSignedUrlOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const requestFn = signedUrl.startsWith("https:")
      ? httpsRequest
      : httpRequest;
    const req = requestFn(
      signedUrl,
      { agent: getProxyAgent(), method: "PUT", headers },
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
    req.on("error", reject);
    writeBody(req).catch((error: unknown) => {
      const asError = error instanceof Error ? error : new Error(String(error));
      req.destroy(asError);
      reject(asError);
    });
  });
