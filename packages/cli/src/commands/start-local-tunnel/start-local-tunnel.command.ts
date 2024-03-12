#!/usr/bin/env node

import { getApiToken } from "@alwaysmeticulous/client";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  IncomingRequestEvent,
  localtunnel,
} from "@alwaysmeticulous/tunnels-client";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import { IS_METICULOUS_SUPER_USER } from "../../utils/constants";

interface Options {
  apiToken: string | undefined;
  port: number;
  host: string | undefined;
  subdomain: string | undefined;
  localHost: string;
  localHttps: boolean;
  localCert: string | undefined;
  localKey: string | undefined;
  localCa: string | undefined;
  allowInvalidCert: boolean;
  printRequests: boolean;
}

const handler = async (argv: Options) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const apiToken = getApiToken(argv.apiToken);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

  const tunnelClosedCallback = defer<null>();

  const tunnel = await localtunnel({
    logger,
    apiToken,
    port: argv.port,
    host: argv.host,
    subdomain: argv.subdomain || null,
    localHost: argv.localHost,
    localHttps: argv.localHttps,
    localCert: argv.localCert,
    localKey: argv.localKey,
    localCa: argv.localCa,
    allowInvalidCert: argv.allowInvalidCert,
  }).catch((err) => {
    throw err;
  });

  tunnel.on("error", (err) => {
    logger.error(err);

    throw err;
  });

  tunnel.on("close", async () => {
    tunnelClosedCallback.resolve(null);
  });

  logger.info(
    `Your url is: ${tunnel.url}, user: ${tunnel.basicAuthUser}, password: ${tunnel.basicAuthPassword}`
  );

  if (argv.printRequests) {
    tunnel.on("request", (info: IncomingRequestEvent) => {
      console.log(new Date().toString(), info.method, info.path);
    });
  }

  process.on("SIGINT", () => {
    logger.info("\nClosing tunnel...");
    tunnel.close();
  });

  await tunnelClosedCallback.promise;
};

export const startLocalTunnelCommand = buildCommand("start-local-tunnel")
  .details({
    // Hide this command from the help menu if the user is not a super user.
    describe: IS_METICULOUS_SUPER_USER
      ? "Expose a local service via Meticulous' secure tunnels service"
      : false,
  })
  .options({
    apiToken: {
      string: true,
      description: "Meticulous API token",
    },
    port: {
      alias: "p",
      describe: "Internal HTTP server port",
      demandOption: true,
      number: true,
    },
    host: {
      alias: "h",
      describe: "Upstream server providing forwarding",
      string: true,
    },
    subdomain: {
      alias: "s",
      describe: "Request this subdomain",
      string: true,
    },
    localHost: {
      alias: "l",
      describe:
        "Tunnel traffic to this host instead of localhost, override Host header to this host",
      default: "localhost",
      string: true,
    },
    localHttps: {
      describe: "Tunnel traffic to a local HTTPS server",
      boolean: true,
      default: false,
    },
    localCert: {
      describe: "Path to certificate PEM file for local HTTPS server",
      string: true,
    },
    localKey: {
      describe: "Path to certificate key file for local HTTPS server",
      string: true,
    },
    localCa: {
      describe:
        "Path to certificate authority file for self-signed certificates",
      string: true,
    },
    allowInvalidCert: {
      describe:
        "Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)",
      boolean: true,
      default: false,
    },
    printRequests: {
      describe: "Print basic request info",
      boolean: true,
      default: false,
    },
  })
  .handler(handler);
