import { EventEmitter } from "events";
import * as net from "net";
import * as tls from "tls";
import axios from "axios";
import axiosRetry from "axios-retry";
import { Logger } from "loglevel";
import TypedEmitter from "typed-emitter";
import { IncomingRequestEvent, LocalTunnelOptions, TunnelInfo } from "../types";
import { TunnelCluster } from "./tunnel-cluster";

const DEFAULT_HOST = "https://tunnels.meticulous.ai";

interface CreateTunnelResponse {
  id: string;
  port: number;
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
  private tunnelCluster: TunnelCluster | null = null;

  public clientId: string | null = null;
  public url: string | null = null;
  public basicAuthUser: string | null = null;
  public basicAuthPassword: string | null = null;

  private readonly pendingSockets: Set<net.Socket | tls.TLSSocket> = new Set();
  private readonly openSocketsSet: Set<net.Socket | tls.TLSSocket>;

  constructor(opts: LocalTunnelOptions) {
    super();
    this.logger = opts.logger;

    this.opts = opts;
    this.closed = false;

    this.host = opts.host || DEFAULT_HOST;

    this.openSocketsSet = new Set();
  }

  _getInfo(body: CreateTunnelResponse): TunnelInfo {
    const {
      id,
      port,
      url,
      max_conn_count,
      tunnel_passphrase,
      basic_auth_user,
      basic_auth_password,
    } = body;
    const { port: localPort, localHost } = this.opts;
    const { localHttps, localCert, localKey, localCa, allowInvalidCert } =
      this.opts;
    const parsedHost = new URL(this.host);

    // determine if we should use tls for the connection to the local server
    // TODO: Don't use parse, use `useTls` from the the response body after migration to the new API endpoint.
    const useTls = parsedHost.protocol === "https:";

    return {
      name: id,
      url,
      maxConn: Math.min(max_conn_count || 1, 50),
      remoteHost: parsedHost.hostname,
      remotePort: port,
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
    };

    const baseUri = `${this.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain;
    // where to quest
    const uri = baseUri + (assignedDomain || "?new");

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
          this.logger.debug(`tunnel server offline: ${err.message}, retry 1s`);
          return setTimeout(getUrl, 1000);
        });
    };

    getUrl();
  }

  _establish(info: TunnelInfo) {
    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(
      info.maxConn + (EventEmitter.defaultMaxListeners || 10)
    );

    this.tunnelCluster = new TunnelCluster({ ...info, logger: this.logger });

    // only emit the url the first time
    this.tunnelCluster.once("open", () => {
      this.emit("url", {
        url: info.url,
        basicAuthUser: info.basicAuthUser,
        basicAuthPassword: info.basicAuthPassword,
      });
    });

    // re-emit socket error
    this.tunnelCluster.on("error", (err) => {
      this.logger.debug("got socket error", err.message);
      this.emit("error", err);
    });

    let tunnelCount = 0;

    setInterval(() => {
      this.logger.warn(
        "tunnel count: %d set: %d pending: %d",
        tunnelCount,
        this.openSocketsSet.size,
        this.pendingSockets.size
      );
    }, 500);

    this.tunnelCluster.on("pending", (socket) => {
      this.pendingSockets.add(socket);
    });

    // track open count
    this.tunnelCluster.on("open", (tunnel) => {
      this.pendingSockets.delete(tunnel);
      const inSet = this.openSocketsSet.has(tunnel);
      if (inSet) {
        this.logger.warn("tunnel already in set");
        return;
      } else {
        this.openSocketsSet.add(tunnel);
      }

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
    this.tunnelCluster.on("dead", (socket) => {
      const isOpen = this.openSocketsSet.has(socket);
      const isPending = this.pendingSockets.has(socket);

      if (!isOpen && !isPending) {
        this.logger.warn("tunnel not in set on disconnect");
        return;
      }
      this.openSocketsSet.delete(socket);
      this.pendingSockets.delete(socket);

      if (isOpen) {
        tunnelCount--;
      }

      this.logger.debug("tunnel dead [total: %d]", tunnelCount);
      if (this.closed || !this.tunnelCluster) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on("request", (req: IncomingRequestEvent) => {
      this.emit("request", req);
    });

    // establish as many tunnels as allowed
    for (let count = 0; count < info.maxConn; ++count) {
      this.tunnelCluster.open();
    }
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

      this._establish(info);
      cb();
    });
  }

  close() {
    this.closed = true;
    this.emit("close");
  }
}
