import { EventEmitter } from "events";
import { parse } from "url";
import axios from "axios";
import { debug as Debug } from "debug";
import { TunnelCluster } from "./TunnelCluster";

const debug = Debug("localtunnel:client");

interface CreateTunnelResponse {
  id: string;
  ip: string;
  port: number;
  url: string;
  cached_url?: string;
  max_conn_count: number;
}

interface CreateTunnelResponseError {
  error: string;
}

interface TunnelInfo {
  name: string;
  url: string;
  cached_url: string | null;
  max_conn: number;
  remote_host: string | null;
  remote_ip: string;
  remote_port: number;
  local_port: number;
  local_host: string;
  local_https: boolean;
  local_cert?: string | undefined;
  local_key?: string | undefined;
  local_ca?: string | undefined;
  allow_invalid_cert: boolean;
}

export interface LocalTunnelOptions {
  port: number;
  subdomain: string | null;
  host: string;
  local_host: string;
  local_https: boolean;
  local_cert?: string | undefined;
  local_key?: string | undefined;
  local_ca?: string | undefined;
  allow_invalid_cert: boolean;
}

export class Tunnel extends EventEmitter {
  private readonly opts: LocalTunnelOptions;
  private closed: boolean;
  private tunnelCluster: TunnelCluster | null = null;

  public clientId: string | null = null;
  public url: string | null = null;
  public cachedUrl: string | null = null;

  constructor(opts: LocalTunnelOptions) {
    super();
    this.opts = opts;
    this.closed = false;
    if (!this.opts.host) {
      this.opts.host = "https://localtunnel.me";
    }
  }

  _getInfo(body: CreateTunnelResponse): TunnelInfo {
    const { id, ip, port, url, cached_url, max_conn_count } = body;
    const { host, port: local_port, local_host } = this.opts;
    const { local_https, local_cert, local_key, local_ca, allow_invalid_cert } =
      this.opts;
    return {
      name: id,
      url,
      cached_url: cached_url || null,
      max_conn: max_conn_count || 1,
      remote_host: parse(host).hostname,
      remote_ip: ip,
      remote_port: port,
      local_port,
      local_host,
      local_https,
      local_cert,
      local_key,
      local_ca,
      allow_invalid_cert,
    };
  }

  // initialize connection
  // callback with connection info
  _init(cb: (err: Error | null, info?: TunnelInfo) => void) {
    const opt = this.opts;
    const getInfo = this._getInfo.bind(this);

    const params = {
      responseType: "json" as const,
    };

    const baseUri = `${opt.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain;
    // where to quest
    const uri = baseUri + (assignedDomain || "?new");

    (function getUrl() {
      axios
        .get<CreateTunnelResponse | CreateTunnelResponseError>(uri, params)
        .then((res) => {
          const body = res.data;
          debug("got tunnel information", res.data);
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
          debug(`tunnel server offline: ${err.message}, retry 1s`);
          return setTimeout(getUrl, 1000);
        });
    })();
  }

  _establish(info: TunnelInfo) {
    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(
      info.max_conn + (EventEmitter.defaultMaxListeners || 10)
    );

    this.tunnelCluster = new TunnelCluster(info);

    // only emit the url the first time
    this.tunnelCluster.once("open", () => {
      this.emit("url", info.url);
    });

    // re-emit socket error
    this.tunnelCluster.on("error", (err) => {
      debug("got socket error", err.message);
      this.emit("error", err);
    });

    let tunnelCount = 0;

    // track open count
    this.tunnelCluster.on("open", (tunnel) => {
      tunnelCount++;
      debug("tunnel open [total: %d]", tunnelCount);

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
      debug("tunnel dead [total: %d]", tunnelCount);
      if (this.closed || !this.tunnelCluster) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on("request", (req) => {
      this.emit("request", req);
    });

    // establish as many tunnels as allowed
    for (let count = 0; count < info.max_conn; ++count) {
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

      // `cached_url` is only returned by proxy servers that support resource caching.
      if (info.cached_url) {
        this.cachedUrl = info.cached_url;
      }

      this._establish(info);
      cb();
    });
  }

  close() {
    this.closed = true;
    this.emit("close");
  }
}