import { defaultShouldRetry } from "@alwaysmeticulous/common";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

export interface SelfOnboardRequest {
  projectName: string;
}

export interface SelfOnboardResponse {
  /** False when the (user, projectName) pair had already been onboarded. */
  created: boolean;
  organization: { id: string; name: string };
  project: { id: string; name: string };
  /** Project-scoped API token. A secret: store it 0600, never print it. */
  apiToken: string;
  recordingToken: string;
}

export type SelfOnboardErrorKind =
  | "rate-limited"
  | "project-limit-reached"
  | "not-logged-in"
  | "forbidden"
  | "unsupported"
  | "unknown";

export class SelfOnboardError extends Error {
  readonly kind: SelfOnboardErrorKind;
  readonly status: number | undefined;

  constructor(kind: SelfOnboardErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SelfOnboardError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Creates (or returns, when it already exists) an empty organization and
 * project for the OAuth caller, and makes that project their OAuth default.
 * Requires an OAuth bearer token, not a project API token.
 */
export const selfOnboard = async (
  client: MeticulousClient,
  request: SelfOnboardRequest,
): Promise<SelfOnboardResponse> => {
  const { data } = await client
    .post<SelfOnboardResponse, SelfOnboardRequest>(
      "oauth/self-onboard",
      request,
      // A 429 here is a per-user creation quota, not transient load shedding,
      // so backing off and retrying would only delay the error.
      {
        retry: {
          shouldRetry: (error: unknown) =>
            defaultShouldRetry(error) &&
            !(isFetchError(error) && error.response?.status === 429),
        },
      },
    )
    .catch((error) => {
      throw toSelfOnboardError(error);
    });
  return data;
};

export const toSelfOnboardError = (error: unknown): unknown => {
  if (!isFetchError(error)) {
    return error;
  }
  const status = error.response?.status;
  const serverMessage = extractServerMessage(error.response?.data);
  const reason = extractServerReason(error.response?.data);
  if (reason === "project-limit-reached") {
    return new SelfOnboardError(
      "project-limit-reached",
      serverMessage ??
        "Your account has reached the maximum number of trial projects.",
      status,
    );
  }
  switch (status) {
    case 429:
      return new SelfOnboardError(
        "rate-limited",
        serverMessage ??
          "Too many projects were created from this account recently. Wait a while and try again.",
        status,
      );
    case 401:
      return new SelfOnboardError(
        "not-logged-in",
        serverMessage ??
          "Meticulous rejected your login for self-onboarding. Run `meticulous auth logout` and try again.",
        status,
      );
    case 403:
      return new SelfOnboardError(
        "forbidden",
        serverMessage ??
          "Meticulous refused to create a trial project for this account.",
        status,
      );
    case 404:
      return new SelfOnboardError(
        "unsupported",
        "This Meticulous backend does not support self-onboarding yet.",
        status,
      );
    default: {
      const enriched = maybeEnrichFetchError(error);
      return new SelfOnboardError(
        "unknown",
        enriched instanceof Error ? enriched.message : String(enriched),
        status,
      );
    }
  }
};

const extractServerMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message) && typeof message[0] === "string") {
    return message.join("; ");
  }
  return null;
};

const extractServerReason = (data: unknown): string | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const reason = (data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
};
