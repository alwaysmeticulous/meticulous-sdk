import type { Logger } from "loglevel";
import type { WorkerInitOptions } from "./lib/tunnel-worker.entrypoint";

export interface TunnelInfo extends Pick<WorkerInitOptions, "harFilePath"> {
  name: string;
  url: string;
  maxConn: number;
  remoteHost: string;
  useTls: boolean;
  tunnelPassphrase: string;
  multiplexingRemotePort: number;
  basicAuthUser: string;
  basicAuthPassword: string;
  localPort: number;
  localHost: string;
  localHttps: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  rewriteHostnameToAppUrl: boolean;
  enableDnsCache: boolean;
  http2Connections?: number | undefined;
}

export interface LocalTunnelOptions
  extends Pick<WorkerInitOptions, "harFilePath"> {
  logger: Logger;
  apiToken: string;
  port: number;
  subdomain?: string;
  host?: string;
  localHost: string;
  localHttps: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  rewriteHostnameToAppUrl: boolean;
  enableDnsCache: boolean;
  http2Connections?: number | undefined;
}

export interface IncomingRequestEvent {
  method: string;
  path: string;
}
