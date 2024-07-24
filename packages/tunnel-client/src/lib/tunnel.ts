import { EventEmitter } from "events";
import net from "net";
import tls from "tls";
import axios, { isAxiosError } from "axios";
import axiosRetry from "axios-retry";
import { BPMux } from "bpmux";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { TUNNEL_HIGH_WATER_MARK } from "../consts";
import { IncomingRequestEvent, LocalTunnelOptions, TunnelInfo } from "../types";
import { TunnelConnectionCluster } from "./tunnel-connection-cluster";
import { TunnelMultiplexingCluster } from "./tunnel-multiplexing-cluster";
import { TunnelMultiplexingPoolingCluster } from "./tunnel-multiplexing-pooling-cluster";

const DEFAULT_HOST = "https://tunnels.meticulous.ai";

interface CreateTunnelResponse {
  id: string;
  port?: number | undefined;
  multiplexing_port?: number | undefined;
  use_no_pool_multiplexing?: boolean | undefined;
  url: string;
  max_conn_count: number;
  tunnel_passphrase: string;
  basic_auth_user: string;
  basic_auth_password: string;
}

interface CreateTunnelResponseError {
  error: string;
}

type TunnelEvents = {
  close: () => void;
  error: (error: Error) => void;
  request: (req: IncomingRequestEvent) => void;
  url: (info: {
    url: string;
    basicAuthUser: string;
    basicAuthPassword: string;
  }) => void;
};

export class Tunnel extends (EventEmitter as new () => TypedEmitter<TunnelEvents>) {
  private readonly logger: Logger;
  private readonly opts: Omit<LocalTunnelOptions, "logger" | "host">;
  private readonly host: string;
  private closed: boolean;

  public clientId: string | null = null;
  public url: string | null = null;
  public basicAuthUser: string | null = null;
  public basicAuthPassword: string | null = null;

  constructor(opts: LocalTunnelOptions) {
    super();
    this.logger = opts.logger;

    this.opts = opts;
    this.closed = false;

    this.host = opts.host || DEFAULT_HOST;
  }

  _getInfo(body: CreateTunnelResponse): TunnelInfo {
    const {
      id,
      port,
      multiplexing_port,
      use_no_pool_multiplexing,
      url,
      max_conn_count,
      tunnel_passphrase,
      basic_auth_user,
      basic_auth_password,
    } = body;
    const { port: localPort, localHost } = this.opts;
    const { localHttps, localCert, localKey, localCa, allowInvalidCert } =
      this.opts;
    const parsedHost = new URL(url);

    // Drop the client ID (first part of the subdomain) from the URL to get the remote host to establish tunnel connections to.
    // TODO: Use the host & scheme from the response body.
    const hostParts = parsedHost.hostname.split(".");
    hostParts.shift();
    const remoteHost = hostParts.join(".");

    // determine if we should use tls for the connection to the local server
    // TODO: Don't use parse, use `useTls` from the the response body.
    const useTls = parsedHost.protocol === "https:";

    return {
      name: id,
      url,
      maxConn: max_conn_count || 1,
      remoteHost: remoteHost,
      remotePort: port,
      multiplexingRemotePort: multiplexing_port,
      useNoPoolMultiplexing: use_no_pool_multiplexing,
      useTls,
      tunnelPassphrase: tunnel_passphrase,
      basicAuthUser: basic_auth_user,
      basicAuthPassword: basic_auth_password,
      localPort,
      localHost,
      localHttps,
      localCert,
      localKey,
      localCa,
      allowInvalidCert,
    };
  }

  // initialize connection
  // callback with connection info
  _init(cb: (err: Error | null, info?: TunnelInfo) => void) {
    const opt = this.opts;
    const getInfo = this._getInfo.bind(this);

    const params = {
      responseType: "json" as const,
      headers: {
        Authorization: opt.apiToken,
      },
      params: {
        // Older versions of the client don't support multiplexing.
        // Temporary until all clients support multiplexing.
        supportsMultiplexing: true,
        supportsNoMultiplexingPool: true,
        new: true,
      },
    };

    const baseUri = `${this.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain;
    // where to quest
    const uri = baseUri + (assignedDomain || "");

    const getUrl = () => {
      const client = axios.create({ timeout: 30_000 });
      axiosRetry(client, { retries: 3, shouldResetTimeout: true });
      client
        .get<CreateTunnelResponse | CreateTunnelResponseError>(uri, params)
        .then((res) => {
          const body = res.data;
          this.logger.debug("got tunnel information", res.data);
          if (res.status !== 200) {
            const err = new Error(
              (body && (body as CreateTunnelResponseError).error) ||
                "localtunnel server returned an error, please try again"
            );
            return cb(err);
          }
          cb(null, getInfo(body as CreateTunnelResponse));
        })
        .catch((err) => {
          if (isAxiosError(err)) {
            if (err.response?.status === 401) {
              return cb(new Error("Unauthorized. Please check your API token"));
            }
          }

          this.logger.error(`tunnel server offline: ${err.message}, retry 1s`);
          return setTimeout(getUrl, 1000);
        });
    };

    getUrl();
  }

  async _establish(info: TunnelInfo) {
    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(
      info.maxConn + (EventEmitter.defaultMaxListeners || 10)
    );

    let tunnelCluster:
      | TunnelConnectionCluster
      | TunnelMultiplexingPoolingCluster
      | TunnelMultiplexingCluster;

    if (info.multiplexingRemotePort) {
      this.logger.debug(
        `using multiplexing ${
          info.useNoPoolMultiplexing ? "no-pooling" : "pooling"
        } agent`
      );
      tunnelCluster = await this._establishMultiplexingCluster({
        ...info,
        multiplexingRemotePort: info.multiplexingRemotePort,
        useNoPoolMultiplexing: info.useNoPoolMultiplexing,
      });
    } else if (info.remotePort) {
      this.logger.debug("using connection agent");
      tunnelCluster = new TunnelConnectionCluster({
        ...info,
        remotePort: info.remotePort,
        logger: this.logger,
      });
    } else {
      throw new Error("remotePort or multiplexingRemotePort must be set");
    }

    // only emit the url the first time
    tunnelCluster.once("open", () => {
      this.emit("url", {
        url: info.url,
        basicAuthUser: info.basicAuthUser,
        basicAuthPassword: info.basicAuthPassword,
      });
    });

    // re-emit socket error
    tunnelCluster.on("error", (err) => {
      this.logger.debug("got socket error", err.message);
      this.emit("error", err);
    });

    let tunnelCount = 0;

    // track open count
    tunnelCluster.on("open", (tunnel) => {
      tunnelCount++;
      this.logger.debug("tunnel open [total: %d]", tunnelCount);

      const closeHandler = () => {
        tunnel.destroy();
      };

      if (this.closed) {
        return closeHandler();
      }

      this.once("close", closeHandler);
      tunnel.once("close", () => {
        this.removeListener("close", closeHandler);
      });
    });

    // when a tunnel dies, open a new one
    tunnelCluster.on("dead", () => {
      tunnelCount--;
      this.logger.debug("tunnel dead [total: %d]", tunnelCount);
      if (this.closed || !tunnelCluster) {
        return;
      }
      if (!(tunnelCluster instanceof TunnelMultiplexingCluster)) {
        tunnelCluster.open();
      }
    });

    tunnelCluster.on("request", (req: IncomingRequestEvent) => {
      this.emit("request", req);
    });

    // establish as many tunnels as allowed
    if (!(tunnelCluster instanceof TunnelMultiplexingCluster)) {
      for (let count = 0; count < info.maxConn; ++count) {
        if (
          tunnelCluster instanceof TunnelConnectionCluster ||
          tunnelCluster instanceof TunnelMultiplexingPoolingCluster
        ) {
          tunnelCluster.open();
        }
      }
    } else {
      tunnelCluster.startListening();
    }
  }

  _establishMultiplexingCluster({
    remoteHost,
    multiplexingRemotePort,
    useNoPoolMultiplexing,
    localHost,
    localPort,
    localHttps,
    allowInvalidCert,
    useTls,
    tunnelPassphrase,
  }: Omit<TunnelInfo, "multiplexingRemotePort"> & {
    multiplexingRemotePort: number;
  }): Promise<TunnelMultiplexingPoolingCluster | TunnelMultiplexingCluster> {
    const localProtocol = localHttps ? "https" : "http";
    this.logger.debug(
      "establishing tunnel %s://%s:%s <> %s:%s",
      localProtocol,
      localHost,
      localPort,
      remoteHost,
      multiplexingRemotePort
    );

    let sharedSocket: net.Socket | tls.TLSSocket;

    if (useTls) {
      sharedSocket = tls.connect({
        host: remoteHost,
        port: multiplexingRemotePort,
        rejectUnauthorized: true,
      });
    } else {
      sharedSocket = net.connect({
        host: remoteHost,
        port: multiplexingRemotePort,
      });
    }

    sharedSocket.setNoDelay(true);

    sharedSocket.on("error", (err: NodeJS.ErrnoException) => {
      this.logger.debug("got remote connection error", err.message);

      // emit connection refused errors immediately, because they
      // indicate that the tunnel can't be established.
      if (err.code === "ECONNREFUSED") {
        this.emit(
          "error",
          new Error(
            `connection refused: ${remoteHost}:${multiplexingRemotePort} (check your firewall settings)`
          )
        );
      }

      sharedSocket.end();
    });
    const connectEvent = useTls ? "secureConnect" : "connect";

    return new Promise<
      TunnelMultiplexingCluster | TunnelMultiplexingPoolingCluster
    >((resolve) => {
      sharedSocket.once(connectEvent, () => {
        // Send the tunnel passphrase to the server
        sharedSocket.write(`AUTH ${tunnelPassphrase}`);

        sharedSocket.once("data", (data) => {
          if (data.toString() != "AUTH OK") {
            this.emit("error", new Error("Tunnel auth failed"));
            sharedSocket.end();
          }

          const remoteMuxClient = new BPMux(sharedSocket, {
            highWaterMark: TUNNEL_HIGH_WATER_MARK,
            peer_multiplex_options: {
              highWaterMark: TUNNEL_HIGH_WATER_MARK,
            },
          });

          const tunnelOpts = {
            remoteMuxClient,
            logger: this.logger,
            localHost,
            localPort,
            localHttps,
            allowInvalidCert,
          };

          const tunnelCluster = useNoPoolMultiplexing
            ? new TunnelMultiplexingCluster(tunnelOpts)
            : new TunnelMultiplexingPoolingCluster(tunnelOpts);

          resolve(tunnelCluster);
        });
      });
    });
  }

  open(cb: (err?: Error) => void) {
    this._init((err: Error | null, info?: TunnelInfo) => {
      if (err || !info) {
        return cb(err || undefined);
      }

      this.clientId = info.name;
      this.url = info.url;
      this.basicAuthUser = info.basicAuthUser;
      this.basicAuthPassword = info.basicAuthPassword;

      this._establish(info)
        .then(() => {
          cb();
        })
        .catch((err) => {
          this.emit("error", err);
        });
    });
  }

  close() {
    this.closed = true;
    this.emit("close");
  }
}
