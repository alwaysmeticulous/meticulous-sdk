import { warnOnce } from "./log";

/**
 * Validation for the replay sidecar origin carried on inbound requests.
 *
 * The value arrives in a request header, so in principle anything that can reach the worker
 * can propose one — and the shim POSTs outbound request bodies to whatever it accepts. The
 * guard therefore only honours an origin that could plausibly be a Meticulous replay
 * sidecar running alongside the app: plaintext HTTP on a loopback, docker-gateway or
 * private-network host.
 *
 * `https:` is rejected deliberately. A sidecar reachable over loopback or a pod network has
 * no TLS to offer, so permitting `https:` would buy nothing except a way for a forged header
 * to exfiltrate request bodies to an arbitrary internet host.
 */

const MAX_URL_LENGTH = 2048;

const ALLOWED_HOSTNAMES = new Set([
  "localhost",
  // Docker Desktop and Podman expose the host to containers under these names.
  "host.docker.internal",
  "host.containers.internal",
]);

export const parseReplaySidecarUrl = (
  raw: string | null | undefined,
): string | undefined => {
  if (typeof raw !== "string" || raw.length === 0) {
    return undefined;
  }
  if (raw.length > MAX_URL_LENGTH) {
    warnOnce(
      "replay-sidecar-url",
      "Ignoring an implausibly long Meticulous replay sidecar URL.",
    );
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    warnOnce(
      "replay-sidecar-url",
      "Ignoring an unparseable Meticulous replay sidecar URL.",
    );
    return undefined;
  }

  const isAcceptable =
    url.protocol === "http:" &&
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.search === "" &&
    url.hash === "" &&
    isLocalHostname(url.hostname);

  if (!isAcceptable) {
    warnOnce(
      "replay-sidecar-url",
      `Ignoring the Meticulous replay sidecar URL "${raw}" — only a plain http:// origin on a loopback, docker-gateway or private-network host is honoured.`,
    );
    return undefined;
  }

  // Return the parsed origin rather than the raw string: it is what `fetch` would resolve
  // the value to anyway, so the host that was validated is exactly the host that gets
  // called (alternative IPv4 spellings like "0177.0.0.1" normalize here, rather than being
  // checked in one form and dialled in another). Carries no trailing slash, matching
  // resolveSidecarUrl's normalization so the self-capture prefix check lines up.
  return url.origin;
};

const isLocalHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  if (ALLOWED_HOSTNAMES.has(lower)) {
    return true;
  }
  // URL keeps IPv6 literals bracketed.
  const unbracketed =
    lower.startsWith("[") && lower.endsWith("]")
      ? lower.slice(1, -1)
      : undefined;
  if (unbracketed !== undefined) {
    return unbracketed === "::1";
  }
  return isPrivateIpv4(lower);
};

const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((part) =>
    // Reject anything that is not a plain decimal octet: "010" and "0x7f" are parsed
    // inconsistently across resolvers, and "1e2" would pass a bare Number() check.
    /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN,
  );
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  // Deliberately excludes link-local (169.254.0.0/16): no sidecar is ever reachable there,
  // but the cloud metadata endpoints are (169.254.169.254), so allowing it would only widen
  // the SSRF surface. The rest of the codebase blocks that range for the same reason — see
  // `staging-backend-url.ts` and `assets-app-server.ts`.
  return (
    first === 127 || // loopback
    first === 10 || // RFC1918
    (first === 172 && second >= 16 && second <= 31) || // RFC1918
    (first === 192 && second === 168) // RFC1918
  );
};
