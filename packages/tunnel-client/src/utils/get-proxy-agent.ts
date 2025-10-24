import { ProxyAgent } from "proxy-agent";

export const getProxyAgent = () => {
  return new ProxyAgent({
    keepAlive: true,
  });
};
