import EventEmitter from "events";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import * as net from "net";
import { createServer, Http2Server } from "node:http2";
import { pipeline } from "stream";
import Agent, { HttpsAgent } from "agentkeepalive";
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
  getHost: () => string;
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
  private readonly opts: TunnelHTTP2ClusterOpts;
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
    const httpAgent = new Agent();
    const httpsAgent = new HttpsAgent();

    this.server.on("request", (req, res) => {
      this.emit("request", {
        method: req.method ?? "unknown",
        path: req.url ?? "unknown",
      });

      // Drop host & connection header from the original request. Let Node handle it.
      // Also grab our headers that tell us the original host and protocol.
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        host,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        connection,
        "x-meticulous-original-url": originalUrl,
        ..._headersToForward
      } = req.headers;

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

      // Forward the request to the right target
      const { hostToRequest, portToRequest, protocolToRequest } =
        this.getRequestTarget(originalUrl);
      const request =
        protocolToRequest === "https" ? httpsRequest : httpRequest;
      const agent = protocolToRequest === "https" ? httpsAgent : httpAgent;

      const clientReq = request(
        {
          agent,
          host: hostToRequest,
          port: portToRequest,
          path: req.url,
          method: req.method,
          headers: headersToForward,
        },
        (clientRes) => {
          // Drop HTTP1 specific headers
          const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            connection,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            "keep-alive": _,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // By default the server doesn't listen to anything, but we can
      // emit connection events which will make the server listen to any
      // requests sent over those connections
      // See: https://nodejs.org/api/http2.html#event-connection
      this.server.emit("connection", socket);
      socket.resume();
    });
  }

  private getRequestTarget(originalUrl: string | string[] | undefined) {
    const defaultTarget = {
      hostToRequest: this.opts.localHost,
      portToRequest: this.opts.localPort,
      protocolToRequest: "http",
    };
    try {
      if (!originalUrl) {
        return defaultTarget;
      }
      const parsed = new URL(originalUrl.toString());
      const hostToRequest = parsed.host;
      if (hostToRequest === this.opts.getHost()) {
        // This is actually a request to the tunnel server itself. If we forward it, we will
        // end up in an infinite loop. We want to dispatch this request to the local server.
        return defaultTarget;
      }
      const protocolToRequest = (parsed.protocol || "http").replace(":", "");
      const portToRequest =
        parsed.port || (parsed.protocol === "https" ? 443 : 80);
      return {
        hostToRequest,
        portToRequest,
        protocolToRequest,
      };
    } catch (error) {
      this.logger.error("Error getting request target", error);
      return defaultTarget;
    }
  }

  close() {
    this.server.close();
  }
}
