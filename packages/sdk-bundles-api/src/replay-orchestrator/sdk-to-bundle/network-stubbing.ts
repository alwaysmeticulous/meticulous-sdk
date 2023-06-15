export type NetworkStubbingMode =
  | StubAllRequests
  | StubNonSSRRequests
  | CustomStubbing;

/**
 * The default mode. Stubs all requests, apart from ones for _next/static/ files.
 */
export interface StubAllRequests {
  type: "stub-all-requests";
}

/**
 * Stubs all requests apart from NextJS 13 /app dir requests to render server components, and requests for _next/static/ files.
 *
 * Used for NextJs 13 /app directory & server components.
 */
export interface StubNonSSRRequests {
  type: "stub-non-ssr-requests";
}

export interface CustomStubbing {
  type: "custom-stubbing";

  /*
   * Any request that matches any of these filters will be passed through to the real backend and not stubed.
   *
   * We use an allowlist / opt-in pattern to reduce risk (e.g. disabling stubbing for all requests, and then
   * running a replay against production rather than staging, without realizing that stubbing is disabled)
   */
  requestsToNotStub: RequestFilter[];
}

export interface RequestFilter {
  /**
   * If defined will filter to only match requests to a URL matching the
   * specified regex.
   *
   * Any JS regex that passes https://github.com/tjenkinson/redos-detector is supported.
   */
  urlRegex: string;
}

export interface NoStubbing {
  type: "no-stubbing";
}
