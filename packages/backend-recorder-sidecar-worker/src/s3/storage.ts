import {
  type AwsCredentials,
  type CognitoConfig,
  CREDENTIALS_EXPIRY_MARGIN_MS,
  fetchCognitoCredentials,
} from "./cognito-credentials";
import { signRequest } from "./sigv4";

/**
 * Writes recorded session chunks to Meticulous' recorder-payloads bucket from inside a Worker.
 *
 * Same bucket and same unauthenticated Cognito identity pool the browser recorder already uploads
 * to from your users' browsers, so this is not a new trust boundary — only a new caller.
 */

export const DEFAULT_S3_REGION = "us-west-2";
export const DEFAULT_S3_BUCKET = "user-events-v3";
export const DEFAULT_IDENTITY_POOL_ID =
  "us-west-2:6a0e6f85-53d0-41d7-b268-dede2251cc9d";

export interface S3StorageConfig {
  region?: string;
  bucket?: string;
  identityPoolId?: string;
  /**
   * Overrides the bucket endpoint, for a local LocalStack or a test double. When set, the request
   * is signed for this host instead of the real S3 one and the key is appended path-style.
   */
  endpointUrl?: string;
}

export interface StorageBackend {
  write(key: string, data: unknown): Promise<void>;
}

export class S3StorageBackend implements StorageBackend {
  private credentials: AwsCredentials | undefined;
  /** Shared so concurrent first writes make one credentials round trip, not one each. */
  private credentialsPromise: Promise<AwsCredentials> | undefined;

  constructor(private readonly config: S3StorageConfig = {}) {}

  async write(key: string, data: unknown): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(data));
    const credentials = await this.getCredentials();
    const signed = await signRequest({
      method: "PUT",
      url: this.objectUrl(key),
      region: this.region,
      service: "s3",
      body,
      credentials,
      nowMs: Date.now(),
      headers: { "content-type": "application/json" },
    });

    const response = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body as BodyInit,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // A 403 here is most often expired credentials, so drop them: the retry then re-fetches
      // rather than re-signing with the same dead key.
      if (response.status === 403) {
        this.credentials = undefined;
      }
      throw new Error(
        `S3 PUT ${key} failed (HTTP ${response.status}): ${detail.slice(0, 500)}`,
      );
    }
    // The body must be drained or workerd holds the connection open.
    await response.arrayBuffer().catch(() => undefined);
  }

  private get region(): string {
    return this.config.region ?? DEFAULT_S3_REGION;
  }

  private objectUrl(key: string): string {
    const bucket = this.config.bucket ?? DEFAULT_S3_BUCKET;
    // Every path segment is encoded by the signer, so the key goes in raw here and the two
    // representations cannot disagree.
    return this.config.endpointUrl !== undefined
      ? `${this.config.endpointUrl.replace(/\/+$/, "")}/${bucket}/${key}`
      : `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private async getCredentials(): Promise<AwsCredentials> {
    const existing = this.credentials;
    if (
      existing !== undefined &&
      existing.expiresAtMs - CREDENTIALS_EXPIRY_MARGIN_MS > Date.now()
    ) {
      return existing;
    }
    this.credentialsPromise ??= this.fetchCredentials();
    return this.credentialsPromise;
  }

  private async fetchCredentials(): Promise<AwsCredentials> {
    const cognito: CognitoConfig = {
      region: this.region,
      identityPoolId: this.config.identityPoolId ?? DEFAULT_IDENTITY_POOL_ID,
    };
    try {
      const credentials = await fetchCognitoCredentials(cognito);
      this.credentials = credentials;
      return credentials;
    } finally {
      // Cleared either way: on success the cached value takes over, and on failure the next write
      // must be able to try again rather than await a rejected promise forever.
      this.credentialsPromise = undefined;
    }
  }
}
