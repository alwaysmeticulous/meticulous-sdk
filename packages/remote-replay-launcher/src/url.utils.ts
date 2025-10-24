export function extractHostnameAndPort(urlString: string): {
  hostname: string;
  port: number;
} {
  let url: URL;
  try {
    url = new URL(urlString);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    throw new Error(`Invalid app URL: '${urlString}'`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    if (["ws:", "wss:", "ftp:"].includes(url.protocol)) {
      throw new Error(
        `Protocol '${url.protocol}' not supported yet: '${urlString}'. Only 'http:' and 'https:' are supported.`,
      );
    }

    // If user omits the protocol, and puts e.g. 'localhost:3000' then it'll parse the protocol as 'localhost' and the
    // hostname as '3000'.
    throw new Error(
      `Protocol '${url.protocol}' not supported yet: '${urlString}'. Only 'http:' and 'https:' are supported. Are you missing a 'http://' or 'https://' prefix?`,
    );
  }

  const port = getPort(url);
  if (port === -1) {
    throw new Error(`Invalid app URL port: '${urlString}'`);
  }

  return { hostname: url.hostname, port };
}

function getPort(url: URL): number {
  //https://developer.mozilla.org/en-US/docs/Web/API/URL/port
  //Port is an empty string, if the default port for the protocol is used

  if (url.port === "") {
    switch (url.protocol) {
      case "http:":
      case "ws:":
        return 80;
      case "https:":
      case "wss:":
        return 443;
      case "ftp:":
        return 21;
      default:
        return -1;
    }
  }

  const port = parseInt(url.port, 10);
  if (isNaN(port)) {
    return -1;
  }

  return port;
}
