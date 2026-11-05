import { describe, expect, it } from "vitest";
import { buildTunnelAuthFailureMessage } from "../auth-failure-message";

describe("buildTunnelAuthFailureMessage", () => {
  it("says no credential was sent and leads with `meticulous auth login`", () => {
    const message = buildTunnelAuthFailureMessage({
      status: 401,
      sentCredential: false,
    });

    expect(message).toMatch(
      /^Authentication failed \(HTTP 401\): the request was sent without credentials\./,
    );
    expect(message.indexOf("meticulous auth login")).toBeLessThan(
      message.indexOf("METICULOUS_API_TOKEN"),
    );
    expect(message).not.toMatch(/probably missing/);
  });

  it("says the sent credential was rejected when one was sent", () => {
    expect(
      buildTunnelAuthFailureMessage({ status: 403, sentCredential: true }),
    ).toMatch(
      /^Authentication failed \(HTTP 403\): the Meticulous credential sent was rejected or lacks access\./,
    );
  });

  it("omits the status when it is unknown", () => {
    expect(
      buildTunnelAuthFailureMessage({ status: null, sentCredential: false }),
    ).toMatch(/^Authentication failed: /);
  });
});
