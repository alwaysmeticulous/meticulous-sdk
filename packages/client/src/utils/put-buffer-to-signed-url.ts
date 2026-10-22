import { sendToSignedUrl } from "./send-to-signed-url";

export interface PutBufferToSignedUrlOptions {
  buffer: Buffer;
  signedUrl: string;
  /** Omit when the URL wasn't signed with a content type. */
  contentType?: string;
}

/** Uploads an in-memory body via an HTTPS PUT; see `putFileToSignedUrl`. */
export const putBufferToSignedUrl = ({
  buffer,
  signedUrl,
  contentType,
}: PutBufferToSignedUrlOptions): Promise<void> =>
  sendToSignedUrl({
    signedUrl,
    headers: {
      "Content-Length": buffer.length,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    writeBody: (request) => {
      request.end(buffer);
      return Promise.resolve();
    },
  });
