import EventEmitter from "events";
import { readFileSync } from "fs";
import * as net from "net";
import { Duplex } from "stream";
import * as tls from "tls";
import { BPMux } from "bpmux";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { HeaderHostTransformer } from "./header-host-transformer";
import { TunnelClusterEvents, TunnelClusterOpts } from "./tunnel-cluster.types";

interface TunnelMultiplexingClusterOpts extends TunnelClusterOpts {
  remoteMuxClient: BPMux<net.Socket>;
}

/**
 * TunnelMultiplexingPoolingCluster manages a single tunnel connection to a remote server and multiplexes
 * multiple connections over that single tunnel.
 * This cluster listens for incoming multiplexed connections and forwards them to a local server.
 */
export class TunnelMultiplexingCluster extends (EventEmitter as new () => TypedEmitter<TunnelClusterEvents>) {
  private readonly logger: Logger;
  private readonly opts: TunnelClusterOpts;
  private readonly remoteMuxClient: BPMux<net.Socket>;

  constructor(opts: TunnelMultiplexingClusterOpts) {
    super();
    this.logger = opts.logger;
    this.opts = opts;

    this.remoteMuxClient = opts.remoteMuxClient;
  }

  startListening() {
    const opt = this.opts;

    const localHost = opt.localHost;
    const localPort = opt.localPort;
    const localProtocol = opt.localHttps ? "https" : "http";

    const allowInvalidCert = opt.allowInvalidCert;
    const connLocal = (remote: Duplex) => {
      if (remote.destroyed) {
        this.logger.debug("remote destroyed");
        this.emit("dead");
        return;
      }

      this.logger.debug(
        "connecting locally to %s://%s:%d",
        localProtocol,
        localHost,
        localPort
      );

      let local: net.Socket | tls.TLSSocket;

      const onConnectionTimeout = () => {
        this.logger.warn("local connection timeout");
        onLocalDisconnect(true);
      };

      let connectionTimeout: NodeJS.Timeout | null = null;

      const CONNECTION_TIMEOUT_MS = 5_000;

      if (opt.localHttps) {
        if (allowInvalidCert) {
          this.logger.debug("allowing invalid certificates");
        } else {
          if (!opt.localCert) {
            throw new Error("local_cert is required for https");
          }

          if (!opt.localKey) {
            throw new Error("local_key is required for https");
          }
        }

        const getLocalCertOpts = () =>
          allowInvalidCert
            ? { rejectUnauthorized: false }
            : {
                cert: readFileSync(opt.localCert as string),
                key: readFileSync(opt.localKey as string),
                ca: opt.localCa ? [readFileSync(opt.localCa)] : undefined,
              };

        // connection to local http server
        local = tls.connect({
          host: localHost,
          port: localPort,
          ...getLocalCertOpts(),
        });
        connectionTimeout = setTimeout(
          onConnectionTimeout,
          CONNECTION_TIMEOUT_MS
        );
      } else {
        local = net.connect({ host: localHost, port: localPort });
      }

      connectionTimeout = setTimeout(
        onConnectionTimeout,
        CONNECTION_TIMEOUT_MS
      );

      const remoteClose = () => {
        this.logger.debug("remote close");
        this.emit("dead");
        local.end();
      };

      remote.once("close", remoteClose);

      const onLocalDisconnect = (reconnect: boolean) => {
        local.end();

        remote.removeListener("close", remoteClose);

        if (!reconnect) {
          return remote.end();
        }

        // retrying connection to local server
        this.logger.warn("retrying connection to local server");
        setTimeout(() => connLocal(remote), 0);
      };

      // TODO some languages have single threaded servers which makes opening up
      // multiple local connections impossible. We need a smarter way to scale
      // and adjust for such instances to avoid beating on the door of the server
      local.once("error", (err) => {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        this.logger.error(
          "local error %s %s %s",
          err.message,
          err.code,
          err,
          err.errors
        );
        onLocalDisconnect(
          err.code === "ECONNREFUSED" || err.code === "ECONNRESET"
        );
      });

      local.once("connect", () => {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        this.logger.debug("connected locally");
        remote.resume();

        let stream: Duplex = remote;

        // if user requested specific local host
        // then we use host header transform to replace the host header
        if (opt.localHost) {
          this.logger.debug("transform Host header to %s", opt.localHost);
          stream = remote.pipe(
            new HeaderHostTransformer({
              host: opt.localHost,
              port: opt.localPort,
            })
          );
        }

        stream.pipe(local).pipe(remote);

        local.once("close", (hadError) => {
          this.logger.debug("local connection closed [%s]", hadError);
        });
      });
    };

    this.remoteMuxClient.on("handshake", (stream) => {
      stream.on("data", (data: any) => {
        // parse the first (request) line of the request to determine the method and path
        // Example: GET /path HTTP/1.1
        const match = data.toString().match(/^(\w+) (\S+)/);
        if (match) {
          this.emit("request", {
            method: match[1],
            path: match[2],
          });
        }
      });

      stream.pause();
      connLocal(stream);

      this.emit("open", stream);
    });
  }
}
