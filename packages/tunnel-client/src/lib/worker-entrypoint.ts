import { parentPort, workerData } from "worker_threads";
import { initLogger } from "@alwaysmeticulous/common";
import { openSocket } from "../utils/open-socket";
import { TunnelHTTP2Cluster } from "./tunnel-http2-cluster";

export interface WorkerInitOptions {
  workerId: number;
  useTls: boolean;
  remoteHost: string;
  multiplexingRemotePort: number;
  tunnelPassphrase: string;
  localHost: string;
  localPort: number;
  localHttps: boolean;
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  rewriteHostnameToAppUrl: boolean;
  enableDnsCache: boolean;
  localCert?: string;
  localKey?: string;
  localCa?: string;
}

const startWorkerThread = async () => {
  const logger = initLogger();
  const options = workerData as WorkerInitOptions;

  if (!parentPort) {
    throw new Error("Worker must be run in a worker thread");
  }

  try {
    const socket = await openSocket({
      useTls: options.useTls,
      remoteHost: options.remoteHost,
      multiplexingRemotePort: options.multiplexingRemotePort,
      tunnelPassphrase: options.tunnelPassphrase,
      sendAuthOkAck: true,
      logger,
      onError: (err) => {
        logger.error("Socket error:", err);
        parentPort?.postMessage({ type: "error", data: err.message });
        process.exit(1);
      },
      onClose: () => {
        logger.warn("Remote connection was closed unexpectedly");
        parentPort?.postMessage({
          type: "error",
          data: "Remote connection was closed unexpectedly",
        });
        process.exit(1);
      },
    });

    const tunnelCluster = new TunnelHTTP2Cluster({
      logger,
      localHost: options.localHost,
      localPort: options.localPort,
      localHttps: options.localHttps,
      allowInvalidCert: options.allowInvalidCert,
      proxyAllUrls: options.proxyAllUrls,
      rewriteHostnameToAppUrl: options.rewriteHostnameToAppUrl,
      enableDnsCache: options.enableDnsCache,
      localCert: options.localCert,
      localKey: options.localKey,
      localCa: options.localCa,
      sockets: [socket],
      getHost: () => options.remoteHost,
    });

    tunnelCluster.on("error", (err) => {
      logger.error("Tunnel cluster error:", err);
      parentPort?.postMessage({ type: "error", data: err.message });
    });

    tunnelCluster.on("request", (req) => {
      logger.debug(`Worker handling request: ${req.method} ${req.path}`);
      parentPort?.postMessage({ type: "request", data: req });
    });

    tunnelCluster.startListening();
    logger.info(
      `Worker thread ${options.workerId} is now listening for requests`,
    );

    parentPort.postMessage({ type: "ready" });
  } catch (error) {
    logger.error(`Worker thread ${options.workerId} failed to start:`, error);
    parentPort?.postMessage({
      type: "error",
      data: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

startWorkerThread().catch((error) => {
  console.error("Failed to start worker thread:", error);
  process.exit(1);
});
