import { createServer } from "node:http";
import JSZip from "jszip";
import { expect, it } from "vitest";
import { downloadAndUnzipJson } from "../download-and-unzip-json";

it("recovers when the download server is unavailable for several seconds", async () => {
  const payload = { snapshots: [1, 2, 3] };
  const zip = new JSZip();
  zip.file("snapshots.json", JSON.stringify(payload));
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  let unavailableUntil: number | undefined;
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    unavailableUntil ??= Date.now() + 5000;
    if (Date.now() < unavailableUntil) {
      response.writeHead(503);
      response.end("Service unavailable");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/gzip" });
    response.end(archive);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (address == null || typeof address === "string") {
      throw new Error("Expected an HTTP server address");
    }
    await expect(
      downloadAndUnzipJson(
        `http://127.0.0.1:${address.port}/snapshots.json.gz`,
      ),
    ).resolves.toEqual(payload);
    expect(requests).toBeGreaterThan(1);
    expect(requests).toBeLessThanOrEqual(4);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}, 30_000);
