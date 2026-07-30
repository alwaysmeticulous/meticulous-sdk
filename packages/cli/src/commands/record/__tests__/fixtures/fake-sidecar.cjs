// Minimal stand-in for the backend recorder sidecar bundle, used by
// backend-sidecar.utils.spec.ts. Reads METICULOUS_SIDECAR_PORT like the real
// bundle and serves /v1/health + /v1/flush; POST /die makes it exit non-zero
// so tests can exercise the restart-once supervision.
const http = require("http");

const port = parseInt(process.env.METICULOUS_SIDECAR_PORT ?? "0", 10);
let flushCount = 0;

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/health") {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true, pid: process.pid, flushCount }));
      return;
    }
    if (req.method === "POST" && req.url === "/v1/flush") {
      flushCount++;
      res.writeHead(204).end();
      return;
    }
    if (req.method === "POST" && req.url === "/die") {
      res.writeHead(204).end();
      setTimeout(() => process.exit(1), 50);
      return;
    }
    res.writeHead(404).end();
  })
  .listen(port, "127.0.0.1");

process.on("SIGTERM", () => process.exit(0));
