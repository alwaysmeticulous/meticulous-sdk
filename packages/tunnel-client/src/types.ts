import type { Logger } from "loglevel";

export interface TunnelInfo {
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

export interface IncomingRequestEvent {
  method: string;
  path: string;
}