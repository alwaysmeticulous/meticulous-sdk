/**
 * Anything with a `fetch` — a Cloudflare service binding (`Fetcher`), or a Durable Object stub.
 * Structural so the shim needs no `@cloudflare/workers-types` dependency.
 */
export interface SidecarFetcher {
  fetch: (...args: unknown[]) => Promise<Response>;
}

/**
 * How capture events reach the sidecar.
 *
 * A local `wrangler dev` recording posts to a loopback URL. A deployed Worker cannot: there is
 * no sidecar process at the edge, and one HTTPS round trip per event to a distant host would be
 * both slow and a subrequest per captured call. So a deployed Worker instead talks to a
 * Meticulous sidecar Worker in the same account through a **service binding**, which stays
 * inside the colo and needs neither DNS nor TLS.
 */
export type SidecarTransport =
  | { kind: "url"; url: string }
  | { kind: "binding"; fetcher: SidecarFetcher; instance: object };

/**
 * Origin the shim addresses a service-binding request to. A service binding delivers to the
 * bound Worker whatever the host is, so only the path is load-bearing — but the URL still has to
 * parse, and using a reserved-by-RFC TLD makes it obvious in a log that no DNS was involved.
 */
export const SIDECAR_BINDING_ORIGIN = "https://meticulous-sidecar.invalid";

/** Env key holding a service binding to the Meticulous recorder sidecar Worker. */
export const SIDECAR_BINDING_ENV_KEY = "METICULOUS_SIDECAR";

/** Env key holding the URL of a local recorder sidecar process. */
export const SIDECAR_URL_ENV_KEY = "METICULOUS_SIDECAR_URL";

/** The origin the shim's own sidecar requests go to, for the self-capture guards. */
export const transportOrigin = (transport: SidecarTransport): string =>
  transport.kind === "url" ? transport.url : SIDECAR_BINDING_ORIGIN;

/**
 * Sends one request to the sidecar, whichever transport is in use.
 *
 * `fetchFn` is the unpatched global fetch, passed in rather than imported so this module stays
 * free of the patch machinery; it is unused for a binding, whose `fetch` is its own method.
 */
export const sidecarFetch = (
  transport: SidecarTransport,
  fetchFn: typeof globalThis.fetch,
  path: string,
  init: RequestInit,
): Promise<Response> => {
  const url = `${transportOrigin(transport)}${path}`;
  return transport.kind === "url"
    ? fetchFn(url, init)
    : transport.fetcher.fetch(new Request(url, init));
};

export interface ResolveSidecarOptions {
  /** Explicit binding, taking precedence over anything found on `env`. */
  sidecarBinding?: SidecarFetcher;
  /** Explicit URL, taking precedence over the env var. */
  sidecarUrl?: string;
}

/**
 * Picks the transport for a recording, or undefined when recording is not configured.
 *
 * A binding wins over a URL. The two are only ever both present by accident — a `.dev.vars`
 * left in an image, say — and the binding is the deliberate one: it can only exist because
 * someone added it to the wrangler configuration of this deployment.
 */
export const resolveSidecarTransport = (
  options: ResolveSidecarOptions | undefined,
  env: unknown,
): SidecarTransport | undefined => {
  const envRecord =
    env !== null && typeof env === "object"
      ? (env as Record<string, unknown>)
      : {};

  const binding = options?.sidecarBinding ?? envRecord[SIDECAR_BINDING_ENV_KEY];
  if (isFetcher(binding)) {
    return { kind: "binding", fetcher: binding, instance: binding };
  }

  const rawUrl = options?.sidecarUrl ?? envRecord[SIDECAR_URL_ENV_KEY];
  if (typeof rawUrl === "string" && rawUrl.length > 0) {
    return { kind: "url", url: rawUrl.replace(/\/+$/, "") };
  }
  return undefined;
};

const isFetcher = (value: unknown): value is SidecarFetcher & object =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as Partial<SidecarFetcher>).fetch === "function";
