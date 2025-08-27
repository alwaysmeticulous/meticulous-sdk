import { EventEmitter } from "events";
import net from "net";
import tls from "tls";
import { Logger } from "loglevel";
import fetch from "node-fetch";
import TypedEmitter from "typed-emitter";
import { IncomingRequestEvent, LocalTunnelOptions, TunnelInfo } from "../types";
import { getProxyAgent } from "../utils/get-proxy-agent";
import { TunnelHTTP2Cluster } from "./tunnel-http2-cluster";

const DEFAULT_HOST = "https://tunnels.meticulous.ai";

/**
 * Default number of connections to establish for HTTP2 multiplexing.
 */
const DEFAULT_HTTP2_NUMBER_OF_CONNECTIONS = 2;

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

    const agentType = "http2-multiplexing";

    this.logger.debug(`using ${agentType} agent`);
    const tunnelCluster = await this._establishMultiplexingCluster({
      ...info,
      multiplexingRemotePort: info.multiplexingRemotePort,
    });

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
    });

    tunnelCluster.on("request", (req: IncomingRequestEvent) => {
      this.emit("request", req);
    });

    tunnelCluster.startListening();

    this.once("close", () => {
      tunnelCluster.close();
    });
  }

  async _establishMultiplexingCluster({
    remoteHost,
    multiplexingRemotePort,
    localHost,
    localPort,
    localHttps,
    allowInvalidCert,
    proxyAllUrls,
    rewriteHostnameToAppUrl,
    enableDnsCache,
    useTls,
    tunnelPassphrase,
    http2Connections,
  }: Omit<TunnelInfo, "multiplexingRemotePort"> & {
    multiplexingRemotePort: number;
  }): Promise<TunnelHTTP2Cluster> {
    const localProtocol = localHttps ? "https" : "http";
    this.logger.debug(
      "establishing tunnel %s://%s:%s <> %s:%s",
      localProtocol,
      localHost,
      localPort,
      remoteHost,
      multiplexingRemotePort,
    );

    const commonTunnelOpts = {
      logger: this.logger,
      localHost,
      localPort,
      localHttps,
      allowInvalidCert,
      proxyAllUrls,
      rewriteHostnameToAppUrl,
      enableDnsCache,
    };

    const numConnections =
      http2Connections ?? DEFAULT_HTTP2_NUMBER_OF_CONNECTIONS;
    const sockets = await Promise.all(
      Array.from({ length: numConnections }).map(() =>
        this.openSocket({
          useTls,
          remoteHost,
          multiplexingRemotePort,
          tunnelPassphrase,
          sendAuthOkAck: true,
        }),
      ),
    );

    return new TunnelHTTP2Cluster({
      ...commonTunnelOpts,
      sockets,
      getHost: () => {
        if (!this.url) {
          throw new Error("Tried to call getHost before tunnel was opened!");
        }
        const parsedUrl = new URL(this.url);
        return parsedUrl.host;
      },
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

  private async createProxyConnection(
    proxyUrl: string,
    targetHost: string,
    targetPort: number,
    useTls: boolean,
  ): Promise<net.Socket> {
    const url = new URL(proxyUrl);
    if (url.protocol === "https:") {
      throw new Error("HTTPS proxy is not supported!");
    }
    const proxyHost = url.hostname;
    const proxyPort = parseInt(url.port) || 80;

    const proxySocket = net.connect({
      host: proxyHost,
      port: proxyPort,
    });

    await new Promise<void>((resolve, reject) => {
      proxySocket.once("connect", () => {
        // Send HTTP CONNECT request
        const connectRequest = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          `Proxy-Connection: keep-alive`,
          "",
          "",
        ].join("\r\n");

        proxySocket.write(connectRequest);

        const onData = (data: Buffer) => {
          const response = data.toString();
          if (
            response.includes("200 Connection established") ||
            response.includes("200 OK")
          ) {
            proxySocket.removeListener("data", onData);
            resolve();
          } else {
            proxySocket.removeListener("data", onData);
            reject(
              new Error(`Proxy CONNECT failed: ${response.split("\r\n")[0]}`),
            );
          }
        };

        proxySocket.on("data", onData);
      });

      proxySocket.once("error", reject);
    });

    if (useTls) {
      return tls.connect({
        socket: proxySocket,
        servername: targetHost,
        rejectUnauthorized: true,
        ALPNProtocols: ["meticulous-tunnel"],
      });
    }

    return proxySocket;
  }

  async openSocket({
    useTls,
    remoteHost,
    multiplexingRemotePort,
    tunnelPassphrase,
    sendAuthOkAck,
  }: Pick<
    TunnelInfo,
    "useTls" | "remoteHost" | "multiplexingRemotePort" | "tunnelPassphrase"
  > & {
    sendAuthOkAck?: boolean;
  }): Promise<net.Socket | tls.TLSSocket> {
    let socket: net.Socket | tls.TLSSocket;

    const proxyUrl = process.env.HTTPS_PROXY;
    if (proxyUrl) {
      socket = await this.createProxyConnection(
        proxyUrl,
        remoteHost,
        multiplexingRemotePort,
        useTls,
      );
    } else if (useTls) {
      socket = tls.connect({
        host: remoteHost,
        port: multiplexingRemotePort,
        rejectUnauthorized: true,
        // The HTTP2 node implementation requires ALPN set.
        // See https://github.com/nodejs/node/blob/9a9409ff1f45c968173118de4cd37dea784f8ec9/lib/internal/http2/core.js#L3039.
        // The server should respond with the ALPN protocol "meticulous-tunnel".
        ALPNProtocols: ["meticulous-tunnel"],
      });
    } else {
      socket = net.connect({
        host: remoteHost,
        port: multiplexingRemotePort,
      });
    }

    socket.setNoDelay(true);

    socket.on("error", (err: NodeJS.ErrnoException) => {
      this.logger.debug("got remote connection error", err.message);

      // emit connection refused errors immediately, because they
      // indicate that the tunnel can't be established.
      if (err.code === "ECONNREFUSED") {
        this.emit(
          "error",
          new Error(
            `connection refused: ${remoteHost}:${multiplexingRemotePort} (check your firewall settings)`,
          ),
        );
      }

      socket.end();
    });

    socket.on("close", () => {
      if (!this.closed) {
        this.logger.error(
          "The remote connection was closed unexpectedly. Please check your network connection and try again.",
        );
      }
    });

    const connectEvent = useTls ? "secureConnect" : "connect";

    await new Promise<void>((resolve) => {
      socket.once(connectEvent, () => {
        // Send the tunnel passphrase to the server
        socket.write(`AUTH ${tunnelPassphrase}`);

        socket.once("data", (data) => {
          if (data.toString() != "AUTH OK") {
            this.emit("error", new Error("Tunnel auth failed"));
            socket.end();
          }

          socket.pause();

          if (sendAuthOkAck) {
            // Some tunnel implementations require an ACK after the AUTH OK message.
            socket.write("AUTH OK ACK", () => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });

    return socket;
  }
}
