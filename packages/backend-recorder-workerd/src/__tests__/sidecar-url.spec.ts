import { describe, expect, it } from "vitest";
import { parseSidecarUrl } from "../sidecar-url";

/**
 * The replay sidecar URL arrives in a request header, and the shim POSTs outbound request
 * bodies to whatever it accepts — so this guard is a security boundary, not a convenience.
 */
describe("parseSidecarUrl", () => {
  it("accepts loopback origins", () => {
    expect(parseSidecarUrl("http://127.0.0.1:9671")).toBe(
      "http://127.0.0.1:9671",
    );
    expect(parseSidecarUrl("http://localhost:9671")).toBe(
      "http://localhost:9671",
    );
    expect(parseSidecarUrl("http://[::1]:9671")).toBe("http://[::1]:9671");
  });

  it("accepts the docker and podman host gateways", () => {
    expect(parseSidecarUrl("http://host.docker.internal:9671")).toBe(
      "http://host.docker.internal:9671",
    );
    expect(parseSidecarUrl("http://host.containers.internal:9671")).toBe(
      "http://host.containers.internal:9671",
    );
  });

  it("accepts private-network origins, for pod-to-pod replay", () => {
    expect(parseSidecarUrl("http://10.1.2.3:9671")).toBe(
      "http://10.1.2.3:9671",
    );
    expect(parseSidecarUrl("http://172.16.0.1:9671")).toBe(
      "http://172.16.0.1:9671",
    );
    expect(parseSidecarUrl("http://172.31.255.254:9671")).toBe(
      "http://172.31.255.254:9671",
    );
    expect(parseSidecarUrl("http://192.168.1.10:9671")).toBe(
      "http://192.168.1.10:9671",
    );
  });

  it("rejects link-local, so a forged header cannot reach cloud metadata", () => {
    expect(parseSidecarUrl("http://169.254.169.254")).toBeUndefined();
    expect(parseSidecarUrl("http://169.254.1.1:9671")).toBeUndefined();
  });

  it("returns a bare origin, so the self-capture prefix check lines up", () => {
    expect(parseSidecarUrl("http://127.0.0.1:9671/")).toBe(
      "http://127.0.0.1:9671",
    );
    // Only a bare origin is accepted, so anything with a real path — including a
    // multi-slash one — is rejected rather than silently trimmed.
    expect(parseSidecarUrl("http://127.0.0.1:9671///")).toBeUndefined();
  });

  it("omits a default port, matching what fetch would use", () => {
    expect(parseSidecarUrl("http://127.5.6.7:80")).toBe("http://127.5.6.7");
  });

  it("rejects absent or empty values", () => {
    expect(parseSidecarUrl(null)).toBeUndefined();
    expect(parseSidecarUrl(undefined)).toBeUndefined();
    expect(parseSidecarUrl("")).toBeUndefined();
  });

  it("rejects public hosts", () => {
    expect(parseSidecarUrl("http://evil.example.com")).toBeUndefined();
    expect(parseSidecarUrl("http://8.8.8.8:9671")).toBeUndefined();
    // Adjacent to, but outside, the RFC1918 ranges.
    expect(parseSidecarUrl("http://172.15.0.1:9671")).toBeUndefined();
    expect(parseSidecarUrl("http://172.32.0.1:9671")).toBeUndefined();
    expect(parseSidecarUrl("http://192.169.1.1:9671")).toBeUndefined();
    expect(parseSidecarUrl("http://11.0.0.1:9671")).toBeUndefined();
  });

  it("rejects a host that merely looks loopback-ish", () => {
    expect(
      parseSidecarUrl("http://localhost.evil.example.com"),
    ).toBeUndefined();
    expect(
      parseSidecarUrl("http://host.docker.internal.evil.com"),
    ).toBeUndefined();
    expect(parseSidecarUrl("http://127.0.0.1.evil.com")).toBeUndefined();
  });

  it("normalizes alternative IPv4 spellings to the host actually dialled", () => {
    // URL parsing resolves octal and hex forms, so the guard checks and returns the same
    // address `fetch` would use — no check-one-host-dial-another gap.
    expect(parseSidecarUrl("http://0177.0.0.1:9671")).toBe(
      "http://127.0.0.1:9671",
    );
    expect(parseSidecarUrl("http://0x7f.0.0.1:9671")).toBe(
      "http://127.0.0.1:9671",
    );
  });

  it("rejects IPv4 spellings the URL parser refuses", () => {
    expect(parseSidecarUrl("http://1e2.0.0.1:9671")).toBeUndefined();
    expect(parseSidecarUrl("http://127.0.0.256:9671")).toBeUndefined();
  });

  it("rejects https, so a forged header cannot exfiltrate bodies off-host", () => {
    // A loopback sidecar has no TLS to offer, so allowing https buys nothing but risk.
    expect(parseSidecarUrl("https://evil.example.com")).toBeUndefined();
    expect(parseSidecarUrl("https://127.0.0.1:9671")).toBeUndefined();
  });

  it("rejects non-http schemes", () => {
    expect(parseSidecarUrl("file:///etc/passwd")).toBeUndefined();
    expect(parseSidecarUrl("ws://127.0.0.1:9671")).toBeUndefined();
    expect(
      parseSidecarUrl("javascript:alert(1)"), // eslint-disable-line no-script-url
    ).toBeUndefined();
  });

  it("rejects embedded credentials, paths, queries and fragments", () => {
    expect(parseSidecarUrl("http://user:pass@127.0.0.1:9671")).toBeUndefined();
    expect(parseSidecarUrl("http://127.0.0.1:9671/v1/x")).toBeUndefined();
    expect(parseSidecarUrl("http://127.0.0.1:9671?a=b")).toBeUndefined();
    expect(parseSidecarUrl("http://127.0.0.1:9671#frag")).toBeUndefined();
  });

  it("rejects unparseable and implausibly long values", () => {
    expect(parseSidecarUrl("not a url")).toBeUndefined();
    expect(
      parseSidecarUrl(`http://127.0.0.1:9671/${"x".repeat(3000)}`),
    ).toBeUndefined();
  });
});
