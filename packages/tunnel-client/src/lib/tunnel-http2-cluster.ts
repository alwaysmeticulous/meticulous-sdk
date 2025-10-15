/* eslint-disable @typescript-eslint/no-unused-vars */

import EventEmitter from "events";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import * as net from "net";
import { createServer, Http2Server } from "node:http2";
import { pipeline } from "stream";
import Agent, { HttpsAgent } from "agentkeepalive";
import CacheableLookup from "cacheable-lookup";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { getLocalAddress } from "../utils/get-local-address";
import { HarWriter } from "../utils/har-writer";
import { TunnelClusterEvents, TunnelClusterOpts } from "./tunnel-cluster.types";

// Increase the default HTTP2 window size to 32MB.
// The default is 64KB which is too small for our use case.
// The window size here dictates how much data can be sent before receiving a window update from the other side.
// nghttp2 (which is used by Node.js) sends a window update when the remaining buffer hits 50% of the window size.
// With 64KB window size and latency of 100ms, the maximum throughput is 64KB / 0.1s = 640KB/s throughput which is too low.
// See https://github.com/nodejs/node/issues/38426.
const HTTP2_WINDOW_SIZE = 1024 * 1024 * 32; // 32MB

const HTTP2_MAX_SESSION_MEMORY = 256; // MB

const METICULOUS_SIMULATION_HOST = "meticulous-simulation.localhost";

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
  private readonly dnsCache: CacheableLookup;
  private readonly harWriter?: HarWriter;

  constructor(opts: TunnelHTTP2ClusterOpts) {
    super();
    this.logger = opts.logger;
    this.opts = opts;
    if (opts.rewriteHostnameToAppUrl && opts.proxyAllUrls) {
      opts.logger.warn(
        "Both --proxyAllUrls and --rewriteHostnameToAppUrl are set. This configuration doesn't make sense, we will only use --rewriteHostnameToAppUrl.",
      );
    }

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

    this.dnsCache = new CacheableLookup({});

    // Initialize HAR writer if file path is provided
    if (opts.harFilePath) {
      this.logger.info(`Writing requests to HAR file at ${opts.harFilePath}`);
      this.harWriter = new HarWriter(opts.harFilePath, this.logger);
    }
  }

  startListening() {
    const httpAgent = new Agent();
    const httpsAgent = new HttpsAgent(
      this.opts.allowInvalidCert
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    );

    if (this.opts.enableDnsCache) {
      this.dnsCache.install(httpAgent);
      this.dnsCache.install(httpsAgent);
    }

    this.server.on("request", (req, res) => {
      this.emit("request", {
        method: req.method ?? "unknown",
        path: req.url ?? "unknown",
      });

      const requestIndex =
        req.headers["Meticulous-Request-Index"] ??
        req.headers["meticulous-request-index"];

      // Capture request start time for HAR logging
      const requestStartTime = Date.now();
      let requestBytes = 0;
      let responseBytes = 0;
      console.log(
        `[${timeStr()}] [${requestIndex?.toString().padStart(5, "0")}] Received start of request ${req.url}`,
      );
      let responseEndTime: number | undefined;

      const {
        // (1) Drop host & connection header from the original request. Node will set these correctly for the actual request.
        host,
        connection,
        // (2) Drop some other headers that get set by our tunnel but we don't want to forward.
        "x-datadog-sampling-priority": _datadogSamplingPriority,
        "x-datadog-tags": _datadogTags,
        "x-datadog-trace-id": _datadogTraceId,
        "x-datadog-parent-id": _datadogParentId,
        "x-forwarded-host": _forwardedHost,
        "x-forwarded-for": _forwardedFor,
        "x-forwarded-proto": _forwardedProto,
        "x-original-uri": _originalUri,
        sentrytrace,
        traceparent,
        tracestate,
        baggage,
        // (3) Grab our header that tells us the original host and protocol that was requested.
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
        {} as Record<string, string | string[] | undefined>,
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
          ...getLocalAddress(),
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
          console.log(
            `[${timeStr()}] [${requestIndex?.toString().padStart(5, "0")}] Received response start from forwarded request ${req.url}`,
          );

          // Track response bytes
          clientRes.on("data", (chunk) => {
            responseBytes += chunk.length;
          });

          // console.log(
          //   `Processing response ${req.url} (${JSON.stringify(
          //     {
          //       request: stripEmptyKeys({
          //         cacheControl: clientRes.headers["cache-control"],
          //         ifNoneMatch: clientRes.headers["if-none-match"],
          //         ifModifiedSince: clientRes.headers["if-modified-since"],
          //         ifUnmodifiedSince: clientRes.headers["if-unmodified-since"],
          //         hasAuthorizationHeader:
          //           clientRes.headers["authorization"] !== undefined,
          //       }),
          //       response: stripEmptyKeys({
          //         statusCode: clientRes.statusCode,
          //         cacheControl: clientRes.headers["cache-control"],
          //         expires: clientRes.headers["expires"],
          //         vary: clientRes.headers["vary"],
          //         lastModified: clientRes.headers["last-modified"],
          //         etag: clientRes.headers["etag"],
          //       }),
          //     },
          //     null,
          //     2,
          //   )})`,
          // );

          pipeline(clientRes, res, (err) => {
            if (err) {
              this.logger.error("Response pipeline error", err);
            }
            responseEndTime = Date.now();
            console.log(
              `[${timeStr()}] [${requestIndex?.toString().padStart(5, "0")}] Finished streaming response from forwarded request through tunnel (${responseBytes} bytes)`,
            );

            // Update HAR entry with final timing if enabled
            if (this.harWriter && responseEndTime) {
              const { hostToRequest, portToRequest, protocolToRequest } =
                this.getRequestTarget(originalUrl);
              const fullUrl = `${protocolToRequest}://${hostToRequest}:${portToRequest}${req.url}`;

              this.harWriter.addRequest(
                req.method || "GET",
                fullUrl,
                req.headers,
                requestStartTime,
                clientRes.statusCode,
                clientRes.headers,
                responseEndTime,
              );
            }
          });
        },
      );

      // Track request bytes
      req.on("data", (chunk) => {
        requestBytes += chunk.length;
      });

      pipeline(req, clientReq, (err) => {
        console.log(
          `[${timeStr()}] [${requestIndex?.toString().padStart(5, "0")}] Finished streaming request to target (${requestBytes} bytes)`,
        );

        if (err) {
          this.logger.error("Request pipeline error", err);
          if (!res.headersSent) {
            res.writeHead(502);
          }
          res.end();
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

  private isRequestToTunnelServer(host: string) {
    // A request is a request to the tunnel server itself if either:
    // - The host is the tunnel server host
    // - The host is the simulation host which gets rewritten to the tunnel server host
    return host === this.opts.getHost() || host === METICULOUS_SIMULATION_HOST;
  }

  private getRequestTarget(originalUrl: string | string[] | undefined) {
    const defaultTarget = {
      hostToRequest: this.opts.localHost,
      portToRequest: this.opts.localPort,
      protocolToRequest: this.opts.localHttps ? "https" : "http",
    };
    try {
      if (!originalUrl || this.opts.rewriteHostnameToAppUrl) {
        return defaultTarget;
      }
      const parsed = new URL(originalUrl.toString());
      const hostToRequest = parsed.host;
      if (this.isRequestToTunnelServer(hostToRequest)) {
        // This is actually a request to the tunnel server itself. If we forward it, we will
        // end up in an infinite loop. We want to dispatch this request to the local server.
        return defaultTarget;
      }
      if (!this.opts.proxyAllUrls) {
        this.logger.warn(
          `Refusing to proxy request to ${hostToRequest} because proxyAllUrls is not set!`,
        );
        return defaultTarget;
      }
      const protocolToRequest = (parsed.protocol || "http").replace(":", "");
      const portToRequest =
        parsed.port.length > 0
          ? parseInt(parsed.port, 10)
          : protocolToRequest === "https"
            ? 443
            : 80;
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
    if (this.harWriter) {
      this.harWriter.close();
    }
  }
}

const stripEmptyKeys = (obj: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value != null),
  );
};

const timeStr = () => {
  const iso = new Date().toISOString();
  // iso looks like 2024-06-07T19:44:11.279Z
  const timePart = iso.split("T")[1]; // "19:44:11.279Z"
  // Remove Z and keep everything
  return timePart.replace("Z", "");
};
