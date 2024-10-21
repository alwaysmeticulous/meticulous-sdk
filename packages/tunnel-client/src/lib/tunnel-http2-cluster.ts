import EventEmitter from "events";
import { readFileSync } from "fs";
import { request } from "http";
import * as net from "net";
import { createServer, Http2Server } from "node:http2";
import { pipeline } from "stream";
import Agent from "agentkeepalive";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { TunnelClusterEvents, TunnelClusterOpts } from "./tunnel-cluster.types";

// Increase the default HTTP2 window size to 32MB.
// The default is 64KB which is too small for our use case.
// The window size here dictates how much data can be sent before receiving a window update from the other side.
// nghttp2 (which is used by Node.js) sends a window update when the remaining buffer hits 50% of the window size.
// With 64KB window size and latency of 100ms, the maximum throughput is 64KB / 0.1s = 640KB/s throughput which is too low.
// See https://github.com/nodejs/node/issues/38426.
const HTTP2_WINDOW_SIZE = 1024 * 1024 * 32; // 32MB

const HTTP2_MAX_SESSION_MEMORY = 256; // MB

interface TunnelHTTP2ClusterOpts extends TunnelClusterOpts {
  sockets: net.Socket[];
}

/**
 * TunnelHTTP2Cluster manages a few, sometimes one,
 * HTTP2 (over TLS) tunnel connection to a remote server and multiplexes multiple request over those HTTP2 connections.
 * This cluster listening for incoming HTTP2 connections and forwards them to a local server.
 *
 * Under the hood it uses the Node.js HTTP2 server, where each of the tunnel server connections is a separate HTTP2 session
 * within this HTTP2 server.
 */
export class TunnelHTTP2Cluster extends (EventEmitter as new () => TypedEmitter<TunnelClusterEvents>) {
  private readonly logger: Logger;
  private readonly opts: TunnelClusterOpts;
  private readonly sockets: net.Socket[];
  private readonly server: Http2Server;

  constructor(opts: TunnelHTTP2ClusterOpts) {
    super();
    this.logger = opts.logger;
    this.opts = opts;

    this.sockets = opts.sockets;

    this.server = createServer({
      settings: {
        initialWindowSize: HTTP2_WINDOW_SIZE,
      },
      maxSessionMemory: HTTP2_MAX_SESSION_MEMORY,
    });

    this.server.on("session", (session) => {
      session.once("remoteSettings", () => {
        session.setLocalWindowSize(HTTP2_WINDOW_SIZE);
      });
    });
  }

  startListening() {
    const opt = this.opts;

    const localHost = opt.localHost;
    const localPort = opt.localPort;
    const localProtocol = opt.localHttps ? "https" : "http";

    const allowInvalidCert = opt.allowInvalidCert;
    const localCertOpts =
      localProtocol === "http" || allowInvalidCert
        ? { rejectUnauthorized: false }
        : {
            cert: readFileSync(opt.localCert as string),
            key: readFileSync(opt.localKey as string),
            ca: opt.localCa ? [readFileSync(opt.localCa)] : undefined,
          };

    const agent = new Agent();

    this.server.on("request", (req, res) => {
      this.emit("request", {
        method: req.method ?? "unknown",
        path: req.url ?? "unknown",
      });

      // Drop host & connection header from the original request. Let Node handle it.
      const { host, connection, ..._headersToForward } = req.headers;

      // Also drop HTTP2 pseudo headers
      const headersToForward = Object.keys(_headersToForward).reduce(
        (acc, key) => {
          if (!key.startsWith(":")) {
            acc[key] = _headersToForward[key];
          }
          return acc;
        },
        {} as Record<string, string | string[] | undefined>
      );

      // Forward the request to the local server
      const clientReq = request(
        {
          agent,
          host: localHost,
          port: localPort,
          path: req.url,
          method: req.method,
          headers: headersToForward,
          ...localCertOpts,
        },
        (clientRes) => {
          // Drop HTTP1 specific headers
          const {
            connection,
            "keep-alive": _,
            "transfer-encoding": __,
            ...headersToForward
          } = clientRes.headers;

          res.writeHead(clientRes.statusCode as number, headersToForward);

          pipeline(clientRes, res, (err) => {
            if (err) {
              this.logger.error("Response pipeline error", err);
            }
          });
        }
      );

      pipeline(req, clientReq, (err) => {
        if (err) {
          this.logger.error("Request pipeline error", err);
        }
      });
    });

    this.sockets.forEach((socket) => {
      this.server.emit("connection", socket);
      socket.resume();
    });
  }

  close() {
    this.server.close();
  }
}
