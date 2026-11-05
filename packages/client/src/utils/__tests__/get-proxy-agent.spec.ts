import { createServer, request } from "http";
import type { AddressInfo } from "net";
import { describe, expect, it, vi } from "vitest";
import { getProxyAgent } from "../get-proxy-agent";

describe("getProxyAgent", () => {
  it("returns the same agent every time so connections can be reused", () => {
    expect(getProxyAgent()).toBe(getProxyAgent());
  });

  it("reuses the TCP connection across sequential requests", async () => {
    const server = createServer((_req, res) => res.end("ok"));
    let connections = 0;
    server.on("connection", () => {
      connections++;
    });
    vi.stubEnv("NO_PROXY", "127.0.0.1");
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((resolve, reject) => {
          const req = request(
            `http://127.0.0.1:${port}`,
            { agent: getProxyAgent() },
            (res) => {
              res.resume();
              res.on("end", resolve);
              res.on("error", reject);
            },
          );
          req.on("error", reject);
          req.end();
        });
      }
      expect(connections).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.unstubAllEnvs();
    }
  });
});
