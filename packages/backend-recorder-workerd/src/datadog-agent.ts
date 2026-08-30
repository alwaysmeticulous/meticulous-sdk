/**
 * The Datadog agent's HTTP (APM) port. Required, so the rule cannot fire on a host that
 * merely happens to serve a path shaped like one of the agent's.
 */
const DATADOG_AGENT_PORT = "8126";

/**
 * Agent endpoints whose whole path is fixed. `/info` is the capability probe every tracer
 * polls at startup — far too generic a path to recognise anywhere else, and safe here only
 * because the port has already been matched.
 */
const DATADOG_AGENT_PATHS = new Set([
  "/info",
  "/profiling/v1/input",
  "/dogstatsd/v2/proxy",
  "/tracer_flare/v1",
]);

/**
 * Namespaces the agent proxies open-ended sub-paths under, so they can only be matched by
 * prefix.
 */
const DATADOG_AGENT_PATH_PREFIXES = [
  "/telemetry/proxy/",
  "/evp_proxy/",
  "/appsec/proxy/",
];

/** Agent endpoints whose path carries a protocol version the tracer negotiates. */
const DATADOG_AGENT_PATH_PATTERNS = [
  // Trace, stats, remote-config and data-streams submission: /v0.4/traces, /v0.5/traces,
  // /v0.6/stats, /v0.7/config, /v0.1/pipeline_stats.
  /^\/v\d+\.\d+\/(traces|stats|config|pipeline_stats)$/,
  // Dynamic instrumentation and symbol upload: /debugger/v1/input,
  // /debugger/v1/diagnostics, /symdb/v1/input.
  /^\/(debugger|symdb)\/v\d+\/(input|diagnostics)$/,
];

/**
 * Where an outbound call is headed, in the port/path shape Node's `http.RequestOptions` gives
 * us. A URL is the same two fields already parsed — see {@link isOrphanedDatadogAgentUrl}.
 */
export interface OutboundCallTarget {
  port: string | number | undefined;
  /** Origin-form target (`/v0.4/traces?x=1`), or a URL's pathname. */
  path: string | undefined;
}

/**
 * Whether this outbound call is the app's own telemetry leaving for a Datadog agent, with
 * nothing to tie it to a session.
 *
 * A tracer (`dd-trace`, an OTLP exporter pointed at the agent) flushes on a background timer
 * for the lifetime of the process, so its calls sit outside every request's async context and
 * can never be attributed. Recording them costs a steady stream of unstamped CLIENT spans —
 * each a candidate for ingestion's time-window `inferred` tier, where a msgpack trace payload
 * can be handed to an unrelated session as a fallback mock — and the payloads themselves are
 * large and binary, so capturing the bodies is pure waste.
 *
 * Narrow on two axes, for the same reason `isHealthProbeRequest` is:
 *
 * - **No frontend session id.** A flush that _did_ happen inside a request the browser or an
 *   SSR fan-out named is attributable app traffic, and stays recorded. This can therefore only
 *   drop spans that ingestion's session-id match would have discarded anyway.
 * - **The agent's port _and_ one of its own API paths.** Either alone is not enough: an app is
 *   free to serve anything on port 8126, and a path shaped like `/v0.4/traces` on some other
 *   port is the app's own endpoint. Requiring both is what makes a fixed path list safe without
 *   knowing the agent's hostname, which is unrecognisable in practice — `localhost`,
 *   `datadog-agent`, a Kubernetes node IP. Dropping a real call is far worse than recording a
 *   flush, since the call then has no mock and fails hermetically on replay.
 *
 * A consequence worth knowing: an agent on a non-default port (`DD_TRACE_AGENT_PORT`) and
 * agentless submission straight to a `datadoghq.com` intake both keep being recorded.
 */
export const isOrphanedDatadogAgentRequest = (
  target: OutboundCallTarget,
  frontendSessionId: string | undefined,
): boolean =>
  frontendSessionId == null &&
  String(target.port ?? "") === DATADOG_AGENT_PORT &&
  isDatadogAgentPath(target.path);

/**
 * The same verdict from an absolute URL, which is the shape the workerd fetch patch and a
 * capture event on the wire carry.
 */
export const isOrphanedDatadogAgentUrl = (
  url: string,
  frontendSessionId: string | undefined,
): boolean => {
  if (frontendSessionId != null) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return isOrphanedDatadogAgentRequest(
    { port: parsed.port, path: parsed.pathname },
    undefined,
  );
};

const isDatadogAgentPath = (path: string | undefined): boolean => {
  const pathname = normalizeAgentPath(path);
  if (pathname === undefined) {
    return false;
  }
  return (
    DATADOG_AGENT_PATHS.has(pathname) ||
    DATADOG_AGENT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    DATADOG_AGENT_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
  );
};

const normalizeAgentPath = (path: string | undefined): string | undefined => {
  if (path === undefined || !path.startsWith("/")) {
    return undefined;
  }
  return path.split("?")[0].split("#")[0].toLowerCase();
};
