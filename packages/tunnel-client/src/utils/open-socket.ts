import net from "net";
import tls from "tls";
import { Logger } from "loglevel";
import { TunnelInfo } from "../types";

interface OpenSocketOptions
  extends Pick<
    TunnelInfo,
    "useTls" | "remoteHost" | "multiplexingRemotePort" | "tunnelPassphrase"
  > {
  sendAuthOkAck?: boolean;
  logger: Logger;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

const createProxyConnection = async (
  proxyUrl: string,
  targetHost: string,
  targetPort: number,
  useTls: boolean,
): Promise<net.Socket> => {
  const url = new URL(proxyUrl);
  if (url.protocol === "https:") {
    throw new Error("HTTPS proxy is not supported!");
  }
  const proxyHost = url.hostname;
  const proxyPort = parseInt(url.port) || 80;

  const proxySocket = net.connect({
    host: proxyHost,
    port: proxyPort,
  });

  await new Promise<void>((resolve, reject) => {
    proxySocket.once("connect", () => {
      const connectRequest = [
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
        `Host: ${targetHost}:${targetPort}`,
        `Proxy-Connection: keep-alive`,
        "",
        "",
      ].join("\r\n");

      proxySocket.write(connectRequest);

      const onData = (data: Buffer) => {
        const response = data.toString();
        if (
          response.includes("200 Connection established") ||
          response.includes("200 OK")
        ) {
          proxySocket.removeListener("data", onData);
          resolve();
        } else {
          proxySocket.removeListener("data", onData);
          reject(
            new Error(`Proxy CONNECT failed: ${response.split("\r\n")[0]}`),
          );
        }
      };

      proxySocket.on("data", onData);
    });

    proxySocket.once("error", reject);
  });

  if (useTls) {
    return tls.connect({
      socket: proxySocket,
      servername: targetHost,
      rejectUnauthorized: true,
      ALPNProtocols: ["meticulous-tunnel"],
    });
  }

  return proxySocket;
};

export const openSocket = async ({
  useTls,
  remoteHost,
  multiplexingRemotePort,
  tunnelPassphrase,
  sendAuthOkAck,
  logger,
  onError,
  onClose,
}: OpenSocketOptions): Promise<net.Socket | tls.TLSSocket> => {
  let socket: net.Socket | tls.TLSSocket;

  const proxyUrl = process.env.HTTPS_PROXY;
  if (proxyUrl) {
    socket = await createProxyConnection(
      proxyUrl,
      remoteHost,
      multiplexingRemotePort,
      useTls,
    );
  } else if (useTls) {
    socket = tls.connect({
      host: remoteHost,
      port: multiplexingRemotePort,
      rejectUnauthorized: true,
      ALPNProtocols: ["meticulous-tunnel"],
    });
  } else {
    socket = net.connect({
      host: remoteHost,
      port: multiplexingRemotePort,
    });
  }

  socket.setNoDelay(true);

  socket.on("error", (err: NodeJS.ErrnoException) => {
    logger.debug("got remote connection error", err.message);

    if (err.code === "ECONNREFUSED") {
      const connectionError = new Error(
        `connection refused: ${remoteHost}:${multiplexingRemotePort} (check your firewall settings)`,
      );
      if (onError) {
        onError(connectionError);
      }
    }

    socket.end();
  });

  socket.on("close", () => {
    if (onClose) {
      onClose();
    }
  });

  const connectEvent = useTls ? "secureConnect" : "connect";

  await new Promise<void>((resolve, reject) => {
    socket.once(connectEvent, () => {
      socket.write(`AUTH ${tunnelPassphrase}`);

      socket.once("data", (data) => {
        if (data.toString() != "AUTH OK") {
          const authError = new Error("Tunnel auth failed");
          if (onError) {
            onError(authError);
          }
          socket.end();
          reject(authError);
          return;
        }

        socket.pause();

        if (sendAuthOkAck) {
          socket.write("AUTH OK ACK", () => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });

    socket.once("error", reject);
  });

  return socket;
};
