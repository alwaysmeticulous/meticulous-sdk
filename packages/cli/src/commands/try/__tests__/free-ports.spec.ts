import { createServer } from "net";
import { describe, expect, it } from "vitest";
import { findFreePorts } from "../ports/find-free-ports";

describe("findFreePorts", () => {
  it("returns distinct ports that can be listened on", async () => {
    const ports = await findFreePorts(3);

    expect(new Set(ports).size).toBe(3);
    for (const port of ports) {
      await new Promise<void>((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
      });
    }
  });
});
