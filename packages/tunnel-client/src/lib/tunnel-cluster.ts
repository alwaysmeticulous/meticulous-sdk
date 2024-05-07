import EventEmitter from "events";
import { readFileSync } from "fs";
import * as net from "net";
import { Duplex } from "stream";
import * as tls from "tls";
import { BPMux } from "bpmux";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { TUNNEL_HIGH_WATER_MARK } from "../consts";
import { HeaderHostTransformer } from "./header-host-transformer";

interface TunnelClusterOpts {
  logger: Logger;
  remoteMuxClient: BPMux;
  localHost: string;
  localPort: number;
  localHttps: boolean;
  allowInvalidCert: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
}

type TunnelClusterEvents = {
  open: (stream: Duplex) => void;
  dead: () => void;
  request: (request: { method: string; path: string }) => void;
  error: (err: Error) => void;
};

// manages groups of tunnels
export class TunnelCluster extends (EventEmitter as new () => TypedEmitter<TunnelClusterEvents>) {
  private readonly logger: Logger;
  private readonly opts: TunnelClusterOpts;
  private readonly remoteMuxClient: BPMux;

  constructor(opts: TunnelClusterOpts) {
    super();
    this.logger = opts.logger;
    this.opts = opts;

    this.remoteMuxClient = opts.remoteMuxClient;
  }

  open() {
    const remote = this.remoteMuxClient.multiplex({
      highWaterMark: TUNNEL_HIGH_WATER_MARK,
    });
    const opt = this.opts;

    const localHost = opt.localHost;
    const localPort = opt.localPort;
    const localProtocol = opt.localHttps ? "https" : "http";

    const allowInvalidCert = opt.allowInvalidCert;
    const connLocal = () => {
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
      } else {
        local = net.connect({ host: localHost, port: localPort });
      }

      const remoteClose = () => {
        this.logger.debug("remote close");
        this.emit("dead");
        local.end();
      };

      remote.once("close", remoteClose);

      // TODO some languages have single threaded servers which makes opening up
      // multiple local connections impossible. We need a smarter way to scale
      // and adjust for such instances to avoid beating on the door of the server
      local.once("error", (err) => {
        this.logger.debug("local error %s", err.message);
        local.end();

        remote.removeListener("close", remoteClose);

        if (err.code !== "ECONNREFUSED" && err.code !== "ECONNRESET") {
          return remote.end();
        }

        // retrying connection to local server
        setTimeout(connLocal, 1000);
      });

      local.once("connect", () => {
        this.logger.debug("connected locally");
        remote.resume();

        let stream: Duplex = remote;

        // if user requested specific local host
        // then we use host header transform to replace the host header
        if (opt.localHost) {
          this.logger.debug("transform Host header to %s", opt.localHost);
          stream = remote.pipe(
            new HeaderHostTransformer({ host: opt.localHost })
          );
        }

        stream.pipe(local).pipe(remote);

        // when local closes, also get a new remote
        local.once("close", (hadError) => {
          this.logger.debug("local connection closed [%s]", hadError);

          //   remote.end()?
        });
      });
    };

    remote.on("data", (data: any) => {
      const match = data.toString().match(/^(\w+) (\S+)/);
      if (match) {
        this.emit("request", {
          method: match[1],
          path: match[2],
        });
      }
    });

    this.emit("open", remote);

    remote.pause();
    connLocal();
  }
}
