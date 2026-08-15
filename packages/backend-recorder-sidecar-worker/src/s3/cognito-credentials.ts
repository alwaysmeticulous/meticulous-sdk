/**
 * Unauthenticated AWS credentials from a Cognito identity pool, the same way the browser recorder
 * gets them (`packages/recorder/src/s3/upload.ts` in the webapp repo, via
 * `@aws-sdk/credential-providers`). This is a hand-rolled two-call version of that flow, because
 * the AWS SDK is far too large — and too Node-shaped — to put in a Worker.
 *
 * `GetId` and `GetCredentialsForIdentity` are the two public, **unsigned** Cognito Identity APIs:
 * they take no credentials, which is the whole point of an unauthenticated identity pool. So this
 * needs nothing but `fetch`, and the resulting credentials are what sign the S3 PUT.
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** Epoch ms the credentials stop working at. */
  expiresAtMs: number;
}

export interface CognitoConfig {
  region: string;
  identityPoolId: string;
}

/** Refresh this far before real expiry, so an in-flight upload cannot expire mid-signature. */
export const CREDENTIALS_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

interface GetIdResponse {
  IdentityId?: unknown;
}

interface GetCredentialsResponse {
  Credentials?: {
    AccessKeyId?: unknown;
    SecretKey?: unknown;
    SessionToken?: unknown;
    Expiration?: unknown;
  };
}

export const fetchCognitoCredentials = async (
  config: CognitoConfig,
): Promise<AwsCredentials> => {
  const identityId = await getId(config);
  return getCredentialsForIdentity(config, identityId);
};

const getId = async (config: CognitoConfig): Promise<string> => {
  const body = await cognitoCall<GetIdResponse>(config, "GetId", {
    IdentityPoolId: config.identityPoolId,
  });
  if (typeof body.IdentityId !== "string") {
    throw new Error("Cognito GetId returned no IdentityId");
  }
  return body.IdentityId;
};

const getCredentialsForIdentity = async (
  config: CognitoConfig,
  identityId: string,
): Promise<AwsCredentials> => {
  const body = await cognitoCall<GetCredentialsResponse>(
    config,
    "GetCredentialsForIdentity",
    { IdentityId: identityId },
  );
  const credentials = body.Credentials;
  if (
    typeof credentials?.AccessKeyId !== "string" ||
    typeof credentials.SecretKey !== "string" ||
    typeof credentials.SessionToken !== "string"
  ) {
    throw new Error(
      "Cognito GetCredentialsForIdentity returned incomplete credentials",
    );
  }
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretKey,
    sessionToken: credentials.SessionToken,
    // `Expiration` is epoch *seconds* in the JSON protocol. An absent or unparseable value is
    // treated as a short life rather than an error: the credentials still work, and the next
    // upload simply re-fetches them.
    expiresAtMs:
      typeof credentials.Expiration === "number"
        ? credentials.Expiration * 1000
        : Date.now() + 30 * 60 * 1000,
  };
};

const cognitoCall = async <T>(
  config: CognitoConfig,
  target: string,
  payload: Record<string, string>,
): Promise<T> => {
  const response = await fetch(
    `https://cognito-identity.${config.region}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `AWSCognitoIdentityService.${target}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Cognito ${target} failed (HTTP ${response.status}): ${detail.slice(0, 500)}`,
    );
  }
  return (await response.json()) as T;
};
