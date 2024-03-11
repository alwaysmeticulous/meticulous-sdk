import { EventEmitter } from "events";
import axios from "axios";
import { Logger } from "loglevel";
import { TunnelCluster } from "./TunnelCluster";

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

interface TunnelInfo {
  name: string;
  url: string;
  maxConn: number;
  remoteHost: string;
  remotePort: number;
  useTls: boolean;
  tunnelPassphrase: string;
  basicAuthUser: string;
  basicAuthPassword: string;
  localPort: number;
  localHost: string;
  localHttps: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
  allowInvalidCert: boolean;
}

export interface LocalTunnelOptions {
  logger: Logger;
  apiToken: string;
  port: number;
  subdomain: string | null;
  host: string | undefined;
  localHost: string;
  localHttps: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
  allowInvalidCert: boolean;
}

export class Tunnel extends EventEmitter {
  private readonly logger: Logger;
  private readonly opts: Omit<LocalTunnelOptions, "logger" | "host">;
  private readonly host: string;
  private closed: boolean;
  private tunnelCluster: TunnelCluster | null = null;

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
      maxConn: max_conn_count || 1,
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
      axios
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

    // track open count
    this.tunnelCluster.on("open", (tunnel) => {
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
    this.tunnelCluster.on("dead", () => {
      tunnelCount--;
      this.logger.debug("tunnel dead [total: %d]", tunnelCount);
      if (this.closed || !this.tunnelCluster) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on("request", (req) => {
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
