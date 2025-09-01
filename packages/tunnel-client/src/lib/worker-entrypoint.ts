import cluster from "node:cluster";
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

const startClusterWorker = async () => {
  const logger = initLogger();

  if (!cluster.isWorker) {
    throw new Error("This code must be run as a cluster worker");
  }

  if (!process.env.WORKER_OPTIONS) {
    throw new Error(
      "Worker options must be provided via WORKER_OPTIONS environment variable",
    );
  }

  const options = JSON.parse(process.env.WORKER_OPTIONS) as WorkerInitOptions;

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
        process.send?.({ type: "error", data: err.message });
        process.exit(1);
      },
      onClose: () => {
        logger.warn("Remote connection was closed unexpectedly");
        process.send?.({
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
    tunnelCluster.startListening();
    logger.info(
      `Cluster worker ${options.workerId} is now listening for requests`,
    );
  } catch (error) {
    logger.error(`Cluster worker ${options.workerId} failed to start:`, error);
    process.exit(1);
  }
};

startClusterWorker().catch((error) => {
  console.error("Failed to start cluster worker:", error);
  process.exit(1);
});
