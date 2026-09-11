import { CLI_CLIENT_ID, getRevocationEndpoint } from "./oauth-constants";

const REVOCATION_TIMEOUT_MS = 5_000;

export type OAuthRevocationResult =
  | { status: "revoked" }
  | { status: "failed"; reason: string };

/**
 * Revokes a refresh token at the issuer (RFC 7009), ending the offline session
 * behind it so it can no longer mint access tokens. Never throws: logout has to
 * complete offline too, so failures are returned for the caller to warn about.
 */
export const revokeOAuthRefreshToken = async (
  refreshToken: string,
): Promise<OAuthRevocationResult> => {
  try {
    // One deadline for discovery and the revocation itself: an issuer that
    // never answers the well-known document would otherwise stall logout
    // indefinitely, since the POST's timeout is never even created.
    const signal = AbortSignal.timeout(REVOCATION_TIMEOUT_MS);
    const revocationEndpoint = await getRevocationEndpoint(signal);
    const body = new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    const response = await fetch(revocationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal,
    });
    if (!response.ok) {
      return { status: "failed", reason: await describeFailure(response) };
    }
    // RFC 7009 §2.2 answers 200 for a token the server no longer recognises as
    // well, so the body is irrelevant: either way nothing can be refreshed with
    // it any more, which is all logout needs.
    return { status: "revoked" };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const MAX_ERROR_BODY_LENGTH = 200;

// Node's fetch usually leaves statusText empty over HTTP/2, which would reduce
// the warning to a bare status code, and the endpoint answers a rejection with
// an OAuth error object worth surfacing either way.
const describeFailure = async (response: Response): Promise<string> => {
  const status = `${response.status} ${response.statusText}`.trim();
  const detail = await readErrorDetail(response);
  return detail == null ? status : `${status}: ${detail}`;
};

const readErrorDetail = async (response: Response): Promise<string | null> => {
  const body = (await response.text().catch(() => "")).trim();
  if (!body) {
    return null;
  }
  const parsed = parseJson(body);
  const fields = [parsed?.error, parsed?.error_description].filter(
    (field): field is string => typeof field === "string" && field.length > 0,
  );
  if (fields.length === 0 && parsed != null) {
    // A JSON body carrying no OAuth error fields has nothing to add.
    return null;
  }
  const detail = fields.length > 0 ? fields.join(": ") : body;
  return detail.length > MAX_ERROR_BODY_LENGTH
    ? `${detail.slice(0, MAX_ERROR_BODY_LENGTH)}…`
    : detail;
};

const parseJson = (
  body: string,
): { error?: unknown; error_description?: unknown } | null => {
  try {
    return JSON.parse(body) as { error?: unknown; error_description?: unknown };
  } catch {
    return null;
  }
};
