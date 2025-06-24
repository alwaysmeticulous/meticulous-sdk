import { Duplex } from "stream";
import { Logger } from "loglevel";

export interface TunnelClusterOpts {
  logger: Logger;
  localHost: string;
  localPort: number;
  localHttps: boolean;
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  localCert?: string | undefined;
  localKey?: string | undefined;
  localCa?: string | undefined;
}

export type TunnelClusterEvents = {
  open: (stream: Duplex) => void;
  dead: () => void;
  request: (request: { method: string; path: string }) => void;
  error: (err: Error) => void;
};
