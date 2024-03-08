#!/usr/bin/env node
import yargs from "yargs";
import { localtunnel } from "../localtunnel";

interface Options {
  port: number;
  host: string;
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
    .option("port", {
      alias: "p",
      describe: "Internal HTTP server port",
      demandOption: true,
      number: true,
    })
    .option("host", {
      alias: "h",
      describe: "Upstream server providing forwarding",
      default: "https://localtunnel.me",
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
    });

const handle = async (argv: Options) => {
  const tunnel = await localtunnel({
    port: argv.port,
    host: argv.host,
    subdomain: argv.subdomain || null,
    local_host: argv.localHost,
    local_https: argv.localHttps,
    local_cert: argv.localCert,
    local_key: argv.localKey,
    local_ca: argv.localCa,
    allow_invalid_cert: argv.allowInvalidCert,
  }).catch((err) => {
    throw err;
  });

  tunnel.on("error", (err) => {
    throw err;
  });

  console.log("your url is: %s", tunnel.url);

  /**
   * `cachedUrl` is set when using a proxy server that support resource caching.
   * This URL generally remains available after the tunnel itself has closed.
   * @see https://github.com/localtunnel/localtunnel/pull/319#discussion_r319846289
   */
  if (tunnel.cachedUrl) {
    console.log("your cachedUrl is: %s", tunnel.cachedUrl);
  }

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
