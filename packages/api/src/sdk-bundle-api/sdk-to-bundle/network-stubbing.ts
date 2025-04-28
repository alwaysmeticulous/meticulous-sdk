export type NetworkStubbingMode =
  | StubAllRequests
  | StubNonSSRRequests
  | CustomStubbing;

interface NetworkStubbingBase {
  /**
   * When looking for a request to use as a stub, these transformations will be applied to the request first.
   * If not defined, the default identity transformation will be used (i.e., exact matching of the request).
   * These transformations take precedence over any other transformations.
   * They will be applied in the order they are defined.
   */
  identityRequestTransformations?: CustomTransformation[];

  /**
   * When looking for a request to use as a stub, these transformations will be applied after the identity transformations.
   * These transformations are applied in addition to (and after) any identity transformations.
   * They will be applied in the order they are defined.
   */
  customRequestTransformations?: CustomTransformation[];
}

/**
 * The default mode. Stubs all requests, apart from ones for _next/static/ files.
 */
export interface StubAllRequests extends NetworkStubbingBase {
  type: "stub-all-requests";
}

/**
 * Stubs all requests apart from NextJS 13 /app dir requests to render server components, and requests for _next/static/ files.
 *
 * Used for NextJs 13 /app directory & server components.
 */
export interface StubNonSSRRequests extends NetworkStubbingBase {
  type: "stub-non-ssr-requests";
}

export interface CustomStubbing extends NetworkStubbingBase {
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

  /** Defaults to `{ fetch: true, xhr: true, webSockets: true }` */
  connectionTypes?: ConnectionTypesFilter;
}

export interface NoStubbing {
  type: "no-stubbing";
}

export interface ConnectionTypesFilter {
  fetch: boolean;
  xhr: boolean;
  webSockets: boolean;
}

type TransformableRequestData = Pick<Request, "body" | "method" | "url">;

interface CustomTransformationBase {
  /**
   * The regex to match against the request component.
   */
  matchRegex: string;
  /**
   * The replacement for any matches with matchRegex.
   * This can reference groups in the matchRegex, for example:
   * - matchRegex = `id_(\w*)=[^&]*`, replacement = `id_$1=<redacted>`
   * - matchRegex= `id_(?<param_name>\w*)=[^&]*`, replacement = `id_$<param_name>=<redacted>`
   */
  replacement: string;
  requestComponent: keyof TransformableRequestData;
  /*
   * If defined, the transformation will only be applied if the request matches the where clause.
   */
  where?: CustomTransformationWhere;
}

type TransformableUrlFields = keyof Pick<
  URL,
  | "hash"
  | "host"
  | "hostname"
  | "href"
  | "password"
  | "pathname"
  | "port"
  | "protocol"
  | "search"
  | "username"
>;

interface CustomUrlTransformation extends CustomTransformationBase {
  requestComponent: keyof Pick<TransformableRequestData, "url">;
  urlComponent: TransformableUrlFields;
}

interface CustomRequestTransformation extends CustomTransformationBase {
  requestComponent: keyof Omit<TransformableRequestData, "url">;
}

export type CustomTransformation =
  | CustomRequestTransformation
  | CustomUrlTransformation;

/*
 * We use a type union to allow for the where clause to be defined on either a request or url transformation.
 * We can't reuse CustomTransformation because otherwise the type checker will restrict the where clause to have the same type as the original transformation.
 */
export type CustomTransformationWhere =
  | Omit<CustomRequestTransformation, "replacement">
  | Omit<CustomUrlTransformation, "replacement">;
