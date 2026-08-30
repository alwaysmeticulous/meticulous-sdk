import { describe, expect, it } from "vitest";
import {
  isOrphanedDatadogAgentRequest,
  isOrphanedDatadogAgentUrl,
} from "../datadog-agent";

/** On the agent's port, which is half of the rule; the path is the other half. */
const onAgentPort = (path: string) =>
  isOrphanedDatadogAgentRequest({ port: 8126, path }, undefined);

const AGENT_PATHS = [
  "/info",
  "/v0.3/traces",
  "/v0.4/traces",
  "/v0.5/traces",
  "/v0.7/traces",
  "/v0.6/stats",
  "/v0.7/config",
  "/v0.1/pipeline_stats",
  "/profiling/v1/input",
  "/dogstatsd/v2/proxy",
  "/tracer_flare/v1",
  "/debugger/v1/input",
  "/debugger/v1/diagnostics",
  "/debugger/v2/input",
  "/symdb/v1/input",
  "/telemetry/proxy/api/v2/apmtelemetry",
  "/evp_proxy/v2/api/v2/citestcycle",
  "/evp_proxy/v4/api/v2/logs",
  "/appsec/proxy/api/v2/appsecevts",
];

describe("isOrphanedDatadogAgentRequest", () => {
  it.each(AGENT_PATHS)("recognizes %s on the agent's port", (path) => {
    expect(onAgentPort(path)).toBe(true);
    expect(
      isOrphanedDatadogAgentRequest({ port: "8126", path }, undefined),
    ).toBe(true);
  });

  /**
   * Half the rule each. An app is free to serve anything on 8126, and a path shaped like
   * `/v0.4/traces` on some other port is the app's own endpoint — dropping either would leave
   * a real call with no mock on replay.
   */
  it.each(AGENT_PATHS)("leaves %s on another port alone", (path) => {
    expect(
      isOrphanedDatadogAgentRequest({ port: "443", path }, undefined),
    ).toBe(false);
    expect(
      isOrphanedDatadogAgentRequest({ port: "8125", path }, undefined),
    ).toBe(false);
    expect(
      isOrphanedDatadogAgentRequest({ port: undefined, path }, undefined),
    ).toBe(false);
  });

  it.each([
    "/api/items",
    "/v1/traces",
    "/traces",
    "/v0.4/traces/extra",
    "/graphql",
    "/profiling",
    "/debugger/v1/other",
    "/telemetry/proxy",
  ])("leaves the app's own path %s alone on the agent's port", (path) => {
    expect(onAgentPort(path)).toBe(false);
  });

  it("ignores a query string and normalizes case on the path", () => {
    expect(onAgentPort("/v0.4/traces?x=1")).toBe(true);
    expect(onAgentPort("/V0.4/Traces")).toBe(true);
  });

  /**
   * The guard that makes this safe: a flush that happened inside a request the browser or an
   * SSR fan-out named is attributable app traffic. Dropping such a span would leave the call
   * with no mock on replay.
   */
  it("never drops a call carrying a frontend session id", () => {
    expect(
      isOrphanedDatadogAgentRequest(
        { port: 8126, path: "/v0.4/traces" },
        "fs-1",
      ),
    ).toBe(false);
    expect(
      isOrphanedDatadogAgentUrl("http://127.0.0.1:8126/v0.4/traces", "fs-1"),
    ).toBe(false);
  });

  it("treats a missing destination as the app's own", () => {
    expect(
      isOrphanedDatadogAgentRequest(
        { port: undefined, path: undefined },
        undefined,
      ),
    ).toBe(false);
  });
});

describe("isOrphanedDatadogAgentUrl", () => {
  it.each([
    "http://127.0.0.1:8126/v0.4/traces",
    "http://localhost:8126/info",
    "http://datadog-agent.datadog.svc.cluster.local:8126/telemetry/proxy/api/v2/apmtelemetry",
  ])("recognizes %s", (url) => {
    expect(isOrphanedDatadogAgentUrl(url, undefined)).toBe(true);
  });

  it.each([
    // Agentless submission to a Datadog intake: not the agent's port, so recorded. See the
    // rule's docstring.
    "https://trace.agent.datadoghq.com/api/v0.2/traces",
    "https://api.datadoghq.eu/api/v2/series",
    "https://api.example.com/v1/items",
    "http://127.0.0.1:8126/api/items",
  ])("leaves %s alone", (url) => {
    expect(isOrphanedDatadogAgentUrl(url, undefined)).toBe(false);
  });

  it("treats an unparseable url as the app's own", () => {
    expect(isOrphanedDatadogAgentUrl("not a url", undefined)).toBe(false);
  });
});
