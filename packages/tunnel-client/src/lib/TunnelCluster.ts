import EventEmitter from "events";
import { readFileSync } from "fs";
import * as net from "net";
import { Duplex } from "stream";
import * as tls from "tls";
import { debug as Debug } from "debug";
import { HeaderHostTransformer } from "./HeaderHostTransformer";

const debug = Debug("localtunnel:TunnelCluster");

interface TunnelClusterOpts {
  remote_ip?: string;
  remote_host: string | null;
  remote_port: number;
  local_host: string;
  local_port: number;
  local_https: boolean;
  allow_invalid_cert: boolean;
  local_cert?: string | undefined;
  local_key?: string | undefined;
  local_ca?: string | undefined;
}

// manages groups of tunnels
export class TunnelCluster extends EventEmitter {
  private readonly opts: TunnelClusterOpts;

  constructor(opts: TunnelClusterOpts) {
    super();
    this.opts = opts;
  }

  open() {
    const opt = this.opts;

    // Prefer IP if returned by the server
    const remoteHostOrIp = opt.remote_ip || opt.remote_host;
    const remotePort = opt.remote_port;
    const localHost = opt.local_host || "localhost";
    const localPort = opt.local_port;
    const localProtocol = opt.local_https ? "https" : "http";
    const allowInvalidCert = opt.allow_invalid_cert;

    debug(
      "establishing tunnel %s://%s:%s <> %s:%s",
      localProtocol,
      localHost,
      localPort,
      remoteHostOrIp,
      remotePort
    );

    if (!remoteHostOrIp) {
      throw new Error("remote_host or remote_ip is required");
    }

    // connection to localtunnel server
    const remote = net.connect({
      host: remoteHostOrIp,
      port: remotePort,
    });

    remote.setKeepAlive(true);

    remote.on("error", (err: NodeJS.ErrnoException) => {
      debug("got remote connection error", err.message);

      // emit connection refused errors immediately, because they
      // indicate that the tunnel can't be established.
      if (err.code === "ECONNREFUSED") {
        this.emit(
          "error",
          new Error(
            `connection refused: ${remoteHostOrIp}:${remotePort} (check your firewall settings)`
          )
        );
      }

      remote.end();
    });

    const connLocal = () => {
      if (remote.destroyed) {
        debug("remote destroyed");
        this.emit("dead");
        return;
      }

      debug(
        "connecting locally to %s://%s:%d",
        localProtocol,
        localHost,
        localPort
      );
      remote.pause();

      let local: net.Socket | tls.TLSSocket;

      if (opt.local_https) {
        if (allowInvalidCert) {
          debug("allowing invalid certificates");
        } else {
          if (!opt.local_cert) {
            throw new Error("local_cert is required for https");
          }

          if (!opt.local_key) {
            throw new Error("local_key is required for https");
          }
        }

        const getLocalCertOpts = () =>
          allowInvalidCert
            ? { rejectUnauthorized: false }
            : {
                cert: readFileSync(opt.local_cert as string),
                key: readFileSync(opt.local_key as string),
                ca: opt.local_ca ? [readFileSync(opt.local_ca)] : undefined,
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
        debug("remote close");
        this.emit("dead");
        local.end();
      };

      remote.once("close", remoteClose);

      // TODO some languages have single threaded servers which makes opening up
      // multiple local connections impossible. We need a smarter way to scale
      // and adjust for such instances to avoid beating on the door of the server
      local.once("error", (err) => {
        debug("local error %s", err.message);
        local.end();

        remote.removeListener("close", remoteClose);

        if (err.code !== "ECONNREFUSED" && err.code !== "ECONNRESET") {
          return remote.end();
        }

        // retrying connection to local server
        setTimeout(connLocal, 1000);
      });

      local.once("connect", () => {
        debug("connected locally");
        remote.resume();

        let stream: Duplex = remote;

        // if user requested specific local host
        // then we use host header transform to replace the host header
        if (opt.local_host) {
          debug("transform Host header to %s", opt.local_host);
          stream = remote.pipe(
            new HeaderHostTransformer({ host: opt.local_host })
          );
        }

        stream.pipe(local).pipe(remote);

        // when local closes, also get a new remote
        local.once("close", (hadError) => {
          debug("local connection closed [%s]", hadError);
        });
      });
    };

    remote.on("data", (data) => {
      const match = data.toString().match(/^(\w+) (\S+)/);
      if (match) {
        this.emit("request", {
          method: match[1],
          path: match[2],
        });
      }
    });

    // tunnel is considered open when remote connects
    remote.once("connect", () => {
      this.emit("open", remote);
      connLocal();
    });
  }
}