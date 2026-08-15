import type { AwsCredentials } from "./cognito-credentials";

/**
 * AWS SigV4 request signing on WebCrypto.
 *
 * Hand-rolled because the AWS SDK's signer is not usable here: it is large, and its Node crypto
 * path does not exist in workerd. Only what an S3 `PutObject` needs is implemented — a single
 * request with an in-memory body, `UNSIGNED-PAYLOAD` never used (the payload hash is real, since
 * S3 requires it for a non-HTTPS-streaming PUT).
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const encoder = new TextEncoder();

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface SignRequestOptions {
  method: string;
  url: string;
  region: string;
  service: string;
  body: Uint8Array;
  credentials: AwsCredentials;
  /** Epoch ms to sign at. Passed in rather than read here so a test can pin it. */
  nowMs: number;
  /** Extra headers to sign alongside `host` and the `x-amz-*` set. */
  headers?: Record<string, string>;
}

export const signRequest = async ({
  method,
  url,
  region,
  service,
  body,
  credentials,
  nowMs,
  headers = {},
}: SignRequestOptions): Promise<SignedRequest> => {
  const parsed = new URL(url);
  const { amzDate, dateStamp } = formatDates(nowMs);
  const payloadHash = await sha256Hex(body);

  const signedHeaders: Record<string, string> = {
    ...lowerCaseKeys(headers),
    host: parsed.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "x-amz-security-token": credentials.sessionToken,
  };

  const sortedHeaderNames = Object.keys(signedHeaders).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${signedHeaders[name].trim()}\n`)
    .join("");
  const signedHeaderList = sortedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri(parsed.pathname),
    canonicalQuery(parsed.searchParams),
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(encoder.encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = toHex(await hmac(signingKey, encoder.encode(stringToSign)));

  return {
    url,
    method,
    headers: {
      ...signedHeaders,
      authorization:
        `${ALGORITHM} Credential=${credentials.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
    body,
  };
};

/** `20260811T153045Z` / `20260811`, the two date forms SigV4 uses. */
const formatDates = (nowMs: number): { amzDate: string; dateStamp: string } => {
  const amzDate = new Date(nowMs)
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace(/Z$/, "Z");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
};

/**
 * The path, percent-encoded per SigV4's rules rather than the URL's.
 *
 * S3 keys here are `<token>/BE_<iso>_<id>/<n>`, and an ISO timestamp contains `:`, which the
 * canonical request must carry as `%3A` — a mismatch between the signed path and the sent path is
 * a `SignatureDoesNotMatch` that looks like a credentials problem.
 */
const canonicalUri = (pathname: string): string =>
  pathname
    .split("/")
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join("/");

const canonicalQuery = (params: URLSearchParams): string =>
  [...params.entries()]
    .map(
      ([key, value]) =>
        [encodeRfc3986(key), encodeRfc3986(value)] as [string, string],
    )
    .sort((a, b) => (a[0] === b[0] ? compare(a[1], b[1]) : compare(a[0], b[0])))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `encodeURIComponent` plus the four characters it leaves alone but AWS requires encoded. The
 * unreserved set is A-Z a-z 0-9 `-` `_` `.` `~`.
 */
const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const lowerCaseKeys = (
  headers: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

const deriveSigningKey = async (
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> => {
  let key: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${secretAccessKey}`);
  for (const part of [dateStamp, region, service, "aws4_request"]) {
    key = await hmac(key, encoder.encode(part));
  }
  return key as ArrayBuffer;
};

const hmac = async (
  key: ArrayBuffer | Uint8Array,
  data: Uint8Array,
): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
};

const sha256Hex = async (data: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", data as BufferSource));

const HEX = "0123456789abcdef";

const toHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return hex;
};
