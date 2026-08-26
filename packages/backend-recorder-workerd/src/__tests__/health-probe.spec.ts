import { describe, expect, it } from "vitest";
import { isHealthProbeRequest } from "../health-probe";
import { FRONTEND_SESSION_ID_HEADER } from "../protocol";

const noHeaders = () => undefined;
const withSessionId = (name: string) =>
  name === FRONTEND_SESSION_ID_HEADER ? "sess-1" : undefined;

describe("isHealthProbeRequest", () => {
  it.each([
    "/health",
    "/healthz",
    "/healthcheck",
    "/health-check",
    "/_health",
    "/api/health",
    "/api/healthz",
    "/readyz",
    "/livez",
    "/ping",
  ])("treats %s as a probe", (path) => {
    expect(isHealthProbeRequest("GET", path, noHeaders)).toBe(true);
  });

  it("accepts HEAD as well as GET", () => {
    expect(isHealthProbeRequest("HEAD", "/health", noHeaders)).toBe(true);
    expect(isHealthProbeRequest("head", "/health", noHeaders)).toBe(true);
  });

  it("normalizes case, query strings, fragments and a trailing slash", () => {
    expect(isHealthProbeRequest("GET", "/Health", noHeaders)).toBe(true);
    expect(isHealthProbeRequest("GET", "/health?deep=1", noHeaders)).toBe(true);
    expect(isHealthProbeRequest("GET", "/health#frag", noHeaders)).toBe(true);
    expect(isHealthProbeRequest("GET", "/health/", noHeaders)).toBe(true);
  });

  it("accepts an absolute URL, which is the shape workerd hands the shim", () => {
    expect(
      isHealthProbeRequest("GET", "https://app.example.com/health", noHeaders),
    ).toBe(true);
    expect(
      isHealthProbeRequest(
        "GET",
        "https://app.example.com/api/health?x=1",
        noHeaders,
      ),
    ).toBe(true);
  });

  // The guard that makes this safe: real app traffic always names its session, so a probe
  // path the app actually serves keeps being recorded when the browser or an SSR fan-out
  // calls it. Dropping such a span would leave the call with no mock on replay.
  it("never treats a session-tagged request as a probe", () => {
    expect(isHealthProbeRequest("GET", "/health", withSessionId)).toBe(false);
    expect(isHealthProbeRequest("GET", "/api/health", withSessionId)).toBe(
      false,
    );
  });

  it("ignores non-read methods, which are the app's own endpoint", () => {
    expect(isHealthProbeRequest("POST", "/health", noHeaders)).toBe(false);
    expect(isHealthProbeRequest("DELETE", "/health", noHeaders)).toBe(false);
  });

  it.each([
    "/",
    "/healthy",
    "/health/details",
    "/api/v1/health",
    "/status",
    "/pingback",
  ])("leaves %s alone", (path) => {
    expect(isHealthProbeRequest("GET", path, noHeaders)).toBe(false);
  });

  it("handles a missing or unparseable target", () => {
    expect(isHealthProbeRequest("GET", undefined, noHeaders)).toBe(false);
    expect(isHealthProbeRequest("GET", "", noHeaders)).toBe(false);
    expect(isHealthProbeRequest("GET", "not a url", noHeaders)).toBe(false);
  });
});
