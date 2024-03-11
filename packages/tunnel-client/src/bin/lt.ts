#!/usr/bin/env node

import { getApiToken } from "@alwaysmeticulous/client/dist/api-token.utils";
import {
  initLogger,
  METICULOUS_LOGGER_NAME,
  setLogLevel,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import yargs from "yargs";
import { localtunnel } from "../localtunnel";

interface Options {
  logLevel: string | undefined;
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

const buildOptions = (args: yargs.Argv): yargs.Argv<Options> =>
  args
    .option("apiToken", {
      describe: "Meticulous API token",
      string: true,
    })
    .option("port", {
      alias: "p",
      describe: "Internal HTTP server port",
      demandOption: true,
      number: true,
    })
    .option("host", {
      alias: "h",
      describe: "Upstream server providing forwarding",
      string: true,
    })
    .option("subdomain", {
      alias: "s",
      describe: "Request this subdomain",
      string: true,
    })
    .option("localHost", {
      alias: "l",
      describe:
        "Tunnel traffic to this host instead of localhost, override Host header to this host",
      default: "localhost",
      string: true,
    })
    .option("localHttps", {
      describe: "Tunnel traffic to a local HTTPS server",
      boolean: true,
      default: false,
    })
    .option("localCert", {
      describe: "Path to certificate PEM file for local HTTPS server",
      string: true,
    })
    .option("localKey", {
      describe: "Path to certificate key file for local HTTPS server",
      string: true,
    })
    .option("localCa", {
      describe:
        "Path to certificate authority file for self-signed certificates",
      string: true,
    })
    .option("allowInvalidCert", {
      describe:
        "Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)",
      boolean: true,
      default: false,
    })
    .option("printRequests", {
      describe: "Print basic request info",
      boolean: true,
      default: false,
    })
    .option("logLevel", {
      choices: ["trace", "debug", "info", "warn", "error", "silent"],
      description: "Log level",
    });

const handle = async (argv: Options) => {
  const logger = initLogger();
  setLogLevel(argv.logLevel);

  const apiToken = getApiToken(argv.apiToken);
  if (!apiToken) {
    const logger = log.getLogger(METICULOUS_LOGGER_NAME);
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

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
    throw err;
  });

  logger.info(
    `Your url is: ${tunnel.url}, user: ${tunnel.basicAuthUser}, password: ${tunnel.basicAuthPassword}`
  );

  if (argv.printRequests) {
    tunnel.on("request", (info) => {
      console.log(new Date().toString(), info.method, info.path);
    });
  }
};

yargs
  .usage(
    "$0",
    "Expose a local service via Meticulous' secure tunnels service",
    buildOptions,
    handle
  )
  .env(true)
  .help("help", "Show this help and exit").argv;
