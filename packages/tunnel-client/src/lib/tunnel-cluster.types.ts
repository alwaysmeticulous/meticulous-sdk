import { Duplex } from "stream";
import { Logger } from "loglevel";

export interface TunnelClusterOpts {
  logger: Logger;
  localHost: string;
  localPort: number;
  localHttps: boolean;
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  rewriteHostnameToAppUrl: boolean;
  enableDnsCache: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;

  /** Set if you want to save a HAR file of all the forwarded requests and responses */
  harFilePath?: string | undefined;
}

export type TunnelClusterEvents = {
  open: (stream: Duplex) => void;
  dead: () => void;
  request: (request: { method: string; path: string }) => void;
  error: (err: Error) => void;
};
