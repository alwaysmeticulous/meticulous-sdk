import {
  Agent,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";

const DEFAULT_PORTS: Partial<Record<string, number>> = {
  "http:": 80,
  "https:": 443,
};

const directDispatcher = new Agent();
const proxyDispatchers = new Map<string, Dispatcher>();

export const meticulousFetch = (
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1],
) => {
  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: getDispatcherForInput(input),
  });
};

function getDispatcherForInput(
  input: Parameters<typeof undiciFetch>[0],
): Dispatcher {
  const url = getUrlFromInput(input);
  if (!url) {
    return directDispatcher;
  }

  const { httpProxy, httpsProxy, noProxy } = getProxyConfiguration();
  if (!shouldProxy(url, noProxy)) {
    return directDispatcher;
  }

  if (url.protocol === "https:") {
    return httpsProxy ? getProxyDispatcher(httpsProxy) : directDispatcher;
  }

  return httpProxy ? getProxyDispatcher(httpProxy) : directDispatcher;
}

function getUrlFromInput(
  input: Parameters<typeof undiciFetch>[0],
): URL | undefined {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(input.toString());
    }

    if (typeof input === "object" && input !== null && "url" in input) {
      const requestUrl = input.url;
      if (typeof requestUrl === "string") {
        return new URL(requestUrl);
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getProxyConfiguration(): {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy: string;
} {
  const httpProxy = process.env["http_proxy"] ?? process.env["HTTP_PROXY"];
  const httpsProxy =
    process.env["https_proxy"] ?? process.env["HTTPS_PROXY"] ?? httpProxy;
  const noProxy = process.env["no_proxy"] ?? process.env["NO_PROXY"] ?? "";

  const proxyConfiguration: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy: string;
  } = { noProxy };
  if (httpProxy) {
    proxyConfiguration.httpProxy = httpProxy;
  }
  if (httpsProxy) {
    proxyConfiguration.httpsProxy = httpsProxy;
  }

  return proxyConfiguration;
}

function shouldProxy(url: URL, noProxy: string): boolean {
  const entries = parseNoProxyEntries(noProxy);
  if (entries.length === 0) {
    return true;
  }

  if (noProxy === "*") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const port = Number.parseInt(url.port, 10) || DEFAULT_PORTS[url.protocol] || 0;

  for (const entry of entries) {
    if (entry.port !== 0 && entry.port !== port) {
      continue;
    }

    if (!/^[.*]/.test(entry.hostname)) {
      if (hostname === entry.hostname) {
        return false;
      }
      continue;
    }

    if (hostname.endsWith(entry.hostname.replace(/^\*/, ""))) {
      return false;
    }
  }

  return true;
}

function parseNoProxyEntries(
  noProxy: string,
): Array<{ hostname: string; port: number }> {
  return noProxy
    .split(/[,\s]/)
    .filter(Boolean)
    .map((entry) => {
      const parsed = entry.match(/^(.+):(\d+)$/);

      return {
        hostname: (parsed ? parsed[1] : entry).toLowerCase(),
        port: parsed ? Number.parseInt(parsed[2], 10) : 0,
      };
    });
}

function getProxyDispatcher(uri: string): Dispatcher {
  const existingDispatcher = proxyDispatchers.get(uri);
  if (existingDispatcher) {
    return existingDispatcher;
  }

  const dispatcher = new ProxyAgent({ uri });
  proxyDispatchers.set(uri, dispatcher);
  return dispatcher;
}
