import type { S3StorageConfig } from "./s3/storage";
import type { SessionStoreConfig } from "./session-store";
import { METICULOUS_COMMIT_HASH } from "./version";

/**
 * The sidecar Worker's configuration, all of it from wrangler vars — there are no secrets here.
 * The recording token is the same public value the frontend recorder snippet carries in its
 * `data-recording-token` attribute.
 */
export interface SidecarEnv {
  /** Required. Without it there is no project to file the recording under. */
  METICULOUS_RECORDING_TOKEN?: string;
  /** Shown on the recorded session. Defaults to `unknown_service`, as the Node recorder does. */
  METICULOUS_PROJECT_NAME?: string;
  /**
   * How many Durable Objects the reports are spread across. One is right for anything short of a
   * thousand recorded requests per second (a single object's soft limit); raising it is free,
   * because nothing downstream keys off which object a span passed through.
   */
  METICULOUS_SIDECAR_SHARDS?: string;
  METICULOUS_LOG_LEVEL?: string;
  /** Overrides for testing against LocalStack or a fake S3. Unset in a real deployment. */
  METICULOUS_S3_ENDPOINT_URL?: string;
  METICULOUS_S3_BUCKET?: string;
  METICULOUS_S3_REGION?: string;
  METICULOUS_COGNITO_IDENTITY_POOL_ID?: string;
  /** Bound by the shipped wrangler config; the Worker addresses it by name. */
  METICULOUS_SESSION?: DurableObjectNamespaceLike;
}

/** Structural subset of `DurableObjectNamespace`, so this package needs no Cloudflare types. */
export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface SidecarConfig extends SessionStoreConfig {
  storage: S3StorageConfig;
  shards: number;
}

export const DEFAULT_SHARDS = 1;

export const resolveSidecarConfig = (env: SidecarEnv): SidecarConfig => ({
  recordingToken: env.METICULOUS_RECORDING_TOKEN ?? "",
  meticulousProjectName: env.METICULOUS_PROJECT_NAME ?? "unknown_service",
  recorderVersion: METICULOUS_COMMIT_HASH,
  shards: parseShards(env.METICULOUS_SIDECAR_SHARDS),
  storage: {
    ...(env.METICULOUS_S3_ENDPOINT_URL !== undefined
      ? { endpointUrl: env.METICULOUS_S3_ENDPOINT_URL }
      : {}),
    ...(env.METICULOUS_S3_BUCKET !== undefined
      ? { bucket: env.METICULOUS_S3_BUCKET }
      : {}),
    ...(env.METICULOUS_S3_REGION !== undefined
      ? { region: env.METICULOUS_S3_REGION }
      : {}),
    ...(env.METICULOUS_COGNITO_IDENTITY_POOL_ID !== undefined
      ? { identityPoolId: env.METICULOUS_COGNITO_IDENTITY_POOL_ID }
      : {}),
  },
});

const parseShards = (raw: string | undefined): number => {
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SHARDS;
};
