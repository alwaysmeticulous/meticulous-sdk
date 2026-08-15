import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AwsCredentials } from "../s3/cognito-credentials";
import { signRequest } from "../s3/sigv4";

/**
 * The signature is checked against an independent Node-crypto implementation of SigV4 rather than
 * against a recorded string, so a bug in the WebCrypto version cannot be baked into the
 * expectation. A wrong signature surfaces from S3 as a 403 that reads like a credentials problem,
 * which is exactly the kind of failure worth pinning down here rather than in a deployment.
 */

const CREDENTIALS: AwsCredentials = {
  accessKeyId: "ASIAEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  sessionToken: "session-token-value",
  expiresAtMs: 4_000_000_000_000,
};

const NOW_MS = Date.UTC(2026, 7, 11, 15, 30, 45);

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "utf8") : data)
    .digest("hex");

/** An independent SigV4 signer, deliberately written from the AWS spec rather than shared. */
const referenceSignature = (options: {
  method: string;
  url: string;
  region: string;
  service: string;
  body: Uint8Array;
  headers: Record<string, string>;
  nowMs: number;
}): { signature: string; signedHeaders: string } => {
  const parsed = new URL(options.url);
  const amzDate = new Date(options.nowMs)
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(options.body);

  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(options.headers).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    host: parsed.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "x-amz-security-token": CREDENTIALS.sessionToken,
  };
  const names = Object.keys(headers).sort();
  const canonicalRequest = [
    options.method,
    parsed.pathname
      .split("/")
      .map((segment) =>
        encodeURIComponent(segment).replace(
          /[!'()*]/g,
          (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
        ),
      )
      .join("/"),
    "",
    names.map((name) => `${name}:${headers[name].trim()}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  let key = hmac(`AWS4${CREDENTIALS.secretAccessKey}`, dateStamp);
  key = hmac(key, options.region);
  key = hmac(key, options.service);
  key = hmac(key, "aws4_request");

  return {
    signature: hmac(key, stringToSign).toString("hex"),
    signedHeaders: names.join(";"),
  };
};

describe("signRequest", () => {
  it("matches an independent SigV4 implementation", async () => {
    const body = new TextEncoder().encode('{"spans":[]}');
    const url =
      "https://user-events-v3.s3.us-west-2.amazonaws.com/abc123def456/BE_2026-08-11T15:30:45.000Z_deadbeef/1";
    const headers = { "content-type": "application/json" };

    const signed = await signRequest({
      method: "PUT",
      url,
      region: "us-west-2",
      service: "s3",
      body,
      credentials: CREDENTIALS,
      nowMs: NOW_MS,
      headers,
    });

    const reference = referenceSignature({
      method: "PUT",
      url,
      region: "us-west-2",
      service: "s3",
      body,
      headers,
      nowMs: NOW_MS,
    });

    expect(signed.headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${CREDENTIALS.accessKeyId}/20260811/us-west-2/s3/aws4_request, ` +
        `SignedHeaders=${reference.signedHeaders}, Signature=${reference.signature}`,
    );
  });

  it("encodes the colons in a session id's timestamp", async () => {
    // A session key is `BE_<iso>_<id>`, and an ISO timestamp contains `:`. The canonical request
    // must carry it as %3A or S3 answers SignatureDoesNotMatch — which reads as a credentials
    // problem and is very hard to diagnose from a deployment.
    const signed = await signRequest({
      method: "PUT",
      url: "https://bucket.s3.us-west-2.amazonaws.com/tok/BE_2026-08-11T15:30:45.000Z_x/1",
      region: "us-west-2",
      service: "s3",
      body: new Uint8Array(),
      credentials: CREDENTIALS,
      nowMs: NOW_MS,
    });
    const reference = referenceSignature({
      method: "PUT",
      url: "https://bucket.s3.us-west-2.amazonaws.com/tok/BE_2026-08-11T15:30:45.000Z_x/1",
      region: "us-west-2",
      service: "s3",
      body: new Uint8Array(),
      headers: {},
      nowMs: NOW_MS,
    });

    expect(signed.headers.authorization).toContain(reference.signature);
  });

  it("signs the real payload hash, and the session token", async () => {
    const body = new TextEncoder().encode("payload");

    const signed = await signRequest({
      method: "PUT",
      url: "https://bucket.s3.us-west-2.amazonaws.com/key",
      region: "us-west-2",
      service: "s3",
      body,
      credentials: CREDENTIALS,
      nowMs: NOW_MS,
    });

    expect(signed.headers["x-amz-content-sha256"]).toBe(sha256Hex(body));
    // Cognito hands out temporary credentials, so the token is mandatory — omitting it is a 403.
    expect(signed.headers["x-amz-security-token"]).toBe(
      CREDENTIALS.sessionToken,
    );
    expect(signed.headers.authorization).toContain("x-amz-security-token");
    expect(signed.headers["x-amz-date"]).toBe("20260811T153045Z");
  });

  it("changes the signature when the body changes", async () => {
    const sign = (body: string) =>
      signRequest({
        method: "PUT",
        url: "https://bucket.s3.us-west-2.amazonaws.com/key",
        region: "us-west-2",
        service: "s3",
        body: new TextEncoder().encode(body),
        credentials: CREDENTIALS,
        nowMs: NOW_MS,
      });

    const [a, b] = await Promise.all([sign("one"), sign("two")]);
    expect(a.headers.authorization).not.toBe(b.headers.authorization);
  });
});
