import type { Logger } from "loglevel";

export interface TunnelInfo {
  name: string;
  url: string;
  maxConn: number;
  remoteHost: string;
  useTls: boolean;
  tunnelPassphrase: string;
  multiplexingRemotePort: number;
  useNoPoolMultiplexing?: boolean | undefined;
  useHTTP2ForMultiplexing?: boolean | undefined;
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
  subdomain?: string;
  host?: string;
  localHost: string;
  localHttps: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
  allowInvalidCert: boolean;
}

export interface IncomingRequestEvent {
  method: string;
  path: string;
}
