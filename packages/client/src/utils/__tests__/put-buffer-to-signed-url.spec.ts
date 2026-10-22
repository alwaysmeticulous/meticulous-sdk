import { createServer, type IncomingHttpHeaders } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { putBufferToSignedUrl } from "../put-buffer-to-signed-url";
import { UploadError } from "../retry-transient-upload-errors";

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe("putBufferToSignedUrl", () => {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received.push({ headers: request.headers, body });
      response.statusCode = request.url === "/fail" ? 403 : 200;
      response.end(request.url === "/fail" ? "denied" : "");
    });
  });
  let baseUrl = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("PUTs the buffer with its length", async () => {
    await putBufferToSignedUrl({
      buffer: Buffer.from("hello"),
      signedUrl: `${baseUrl}/ok`,
    });

    expect(received.at(-1)?.body).toBe("hello");
    expect(received.at(-1)?.headers["content-length"]).toBe("5");
    expect(received.at(-1)?.headers["content-type"]).toBeUndefined();
  });

  it("rejects with an UploadError on a non-200 response", async () => {
    const error: unknown = await putBufferToSignedUrl({
      buffer: Buffer.from("x"),
      signedUrl: `${baseUrl}/fail`,
      contentType: "application/gzip",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadError);
    expect(error).toMatchObject({ statusCode: 403, responseBody: "denied" });
    expect(received.at(-1)?.headers["content-type"]).toBe("application/gzip");
  });
});
