import { EventEmitter } from "events";
import cluster, { Worker } from "node:cluster";
import { cpus } from "node:os";
import path from "path";
import { Logger } from "loglevel";
import fetch from "node-fetch";
import TypedEmitter from "typed-emitter";
import { IncomingRequestEvent, LocalTunnelOptions, TunnelInfo } from "../types";
import { getProxyAgent } from "../utils/get-proxy-agent";
import { WorkerInitOptions } from "./tunnel-worker.entrypoint";

const DEFAULT_HOST = "https://tunnels.meticulous.ai";

/**
 * Default number of connections to establish for HTTP2 multiplexing.
 * Uses the number of CPU cores available.
 */
const DEFAULT_HTTP2_NUMBER_OF_CONNECTIONS = cpus().length;

interface CreateTunnelResponse {
  id: string;
  multiplexing_port: number;
  url: string;
  max_conn_count: number;
  tunnel_passphrase: string;
  basic_auth_user: string;
  basic_auth_password: string;
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
  private workers: Worker[] = [];

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
      multiplexing_port,
      url,
      max_conn_count,
      tunnel_passphrase,
      basic_auth_user,
      basic_auth_password,
    } = body;
    const { port: localPort, localHost } = this.opts;
    const {
      localHttps,
      localCert,
      localKey,
      localCa,
      allowInvalidCert,
      proxyAllUrls,
      rewriteHostnameToAppUrl,
      enableDnsCache,
    } = this.opts;
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
      multiplexingRemotePort: multiplexing_port,
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
      proxyAllUrls,
      rewriteHostnameToAppUrl,
      enableDnsCache,
    };
  }

  // initialize connection
  // callback with connection info
  _init(cb: (err: Error | null, info?: TunnelInfo) => void) {
    const opt = this.opts;
    const getInfo = this._getInfo.bind(this);

    const queryParams = {
      supportsHTTP2Multiplexing: true,
      new: true,
    };

    const baseUri = `${this.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain;
    // where to quest
    const baseUriWithDomain = baseUri + (assignedDomain || "");

    // Construct URL with query parameters
    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      urlSearchParams.append(key, String(value));
    });
    const uri = `${baseUriWithDomain}?${urlSearchParams.toString()}`;

    const getUrl = () => {
      fetch(uri, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: opt.apiToken,
        },
        agent: getProxyAgent(),
      })
        .then(async (res) => {
          const body = await res.json();
          this.logger.debug("got tunnel information", body);
          if (res.status !== 200) {
            const err = new Error(
              (body &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : null) ||
                "localtunnel server returned an error, please try again",
            );
            return cb(err);
          }
          cb(null, getInfo(body as CreateTunnelResponse));
        })
        .catch((err) => {
          if (err.message?.includes("Unauthorized")) {
            return cb(new Error("Unauthorized. Please check your API token"));
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
      info.maxConn + (EventEmitter.defaultMaxListeners || 10),
    );

    if (!info.multiplexingRemotePort) {
      throw new Error("multiplexingRemotePort must be set");
    }

    const agentType = "http2-multiplexing-cluster";

    this.logger.debug(`using ${agentType} agent`);
    await this._establishMultiplexingCluster({
      ...info,
      multiplexingRemotePort: info.multiplexingRemotePort,
    });

    // emit the url immediately since cluster workers are handling the connections
    this.emit("url", {
      url: info.url,
      basicAuthUser: info.basicAuthUser,
      basicAuthPassword: info.basicAuthPassword,
    });

    this.once("close", () => {
      this._terminateWorkers();
    });
  }

  async _establishMultiplexingCluster({
    remoteHost,
    multiplexingRemotePort,
    localHost,
    localPort,
    localHttps,
    localCert,
    localKey,
    localCa,
    allowInvalidCert,
    proxyAllUrls,
    rewriteHostnameToAppUrl,
    enableDnsCache,
    useTls,
    tunnelPassphrase,
    http2Connections,
  }: Omit<TunnelInfo, "multiplexingRemotePort"> & {
    multiplexingRemotePort: number;
  }): Promise<void> {
    const localProtocol = localHttps ? "https" : "http";
    this.logger.debug(
      "establishing tunnel %s://%s:%s <> %s:%s using cluster workers",
      localProtocol,
      localHost,
      localPort,
      remoteHost,
      multiplexingRemotePort,
    );

    const numWorkers = http2Connections || DEFAULT_HTTP2_NUMBER_OF_CONNECTIONS;
    const workerPath = path.resolve(__dirname, "tunnel-worker.entrypoint.js");

    cluster.setupPrimary({
      exec: workerPath,
      silent: false,
    });

    for (let i = 1; i <= numWorkers; i++) {
      const workerOptions: WorkerInitOptions = {
        workerId: i,
        useTls,
        remoteHost,
        multiplexingRemotePort,
        tunnelPassphrase,
        localHost,
        localPort,
        localHttps,
        ...(localCert ? { localCert } : {}),
        ...(localKey ? { localKey } : {}),
        ...(localCa ? { localCa } : {}),
        allowInvalidCert,
        proxyAllUrls,
        rewriteHostnameToAppUrl,
        enableDnsCache,
      };

      const worker = cluster.fork();

      worker.on("exit", (code) => {
        if (code !== 0 && !this.closed) {
          this.logger.error(`Worker ${i} stopped with exit code ${code}`);
          this.emit(
            "error",
            new Error(`Worker ${i} stopped with exit code ${code}`),
          );
        }
      });

      worker.send({
        type: "init",
        options: workerOptions,
      });

      this.workers.push(worker);
    }

    this.logger.debug(`Started ${numWorkers} cluster workers for tunnel`);
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

  private _terminateWorkers() {
    this.logger.debug(`Terminating ${this.workers.length} workers`);
    for (const worker of this.workers) {
      worker.kill();
    }
    this.workers = [];
  }

  close() {
    this.closed = true;
    this.emit("close");
  }
}
