import { ProxyAgent } from "proxy-agent";

let sharedAgent: ProxyAgent | undefined;

/**
 * Returns one process-wide agent so that HTTP connections (and their TLS
 * sessions) are reused across requests. A new agent per request would defeat
 * `keepAlive`, paying a TCP + TLS handshake for every PUT to signed URLs.
 */
export const getProxyAgent = (): ProxyAgent => {
  sharedAgent ??= new ProxyAgent({
    keepAlive: true,
  });
  return sharedAgent;
};
