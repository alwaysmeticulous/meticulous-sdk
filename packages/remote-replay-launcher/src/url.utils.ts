export function getPort(url: URL): number {
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
