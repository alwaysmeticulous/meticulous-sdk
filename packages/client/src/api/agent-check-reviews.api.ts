import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";
import type { TestRunCheckType } from "./agent.api";

/** The non-visual check an agent review is about. */
export interface AgentCheckTarget {
  client: MeticulousClient;
  testRunId: string;
  checkId: string;
  /** Defaults to `builtin` server-side when omitted. */
  checkType?: TestRunCheckType | undefined;
}

/**
 * A review comment attached to one non-visual check: for now, the reason
 * stored with an agent review of it.
 */
export interface AgentCheckComment {
  id: string;
  author?: string;
  /** Whether an agent wrote this, from the stored credential. */
  isAgentAuthored: boolean;
  text: string;
  isResolved?: boolean;
}

/** Empty: the reason is stored with the decision rather than handed back. */
export type AgentCheckReviewResponse = Record<string, never>;

/** Record an agent review rejecting one failing check. */
export const rejectCheck = async ({
  reason,
  ...target
}: AgentCheckTarget & {
  reason: string;
}): Promise<AgentCheckReviewResponse> =>
  postToCheck(target, "reject", { reason });

/** Record an agent review approving one failing check, optionally with a reason. */
export const approveCheck = async ({
  reason,
  ...target
}: AgentCheckTarget & {
  reason?: string | undefined;
}): Promise<AgentCheckReviewResponse> =>
  postToCheck(target, "approve", reason != null ? { reason } : {});

/** Record an agent review ignoring one failing check. */
export const ignoreCheck = async ({
  reason,
  ...target
}: AgentCheckTarget & {
  reason: string;
}): Promise<AgentCheckReviewResponse> =>
  postToCheck(target, "ignore", { reason });

export const getCheckComments = async ({
  client,
  testRunId,
  checkId,
  checkType,
  includeResolved,
}: AgentCheckTarget & {
  includeResolved?: boolean | undefined;
}): Promise<AgentCheckComment[]> => {
  const params: Record<string, string> = {};
  if (checkType != null) {
    params.checkType = checkType;
  }
  if (includeResolved) {
    params.includeResolved = "true";
  }
  const { data } = await client
    .get(`${checkPath(testRunId, checkId)}/comments`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

const postToCheck = async <T>(
  { client, testRunId, checkId, checkType }: AgentCheckTarget,
  action: "reject" | "approve" | "ignore",
  body: Record<string, string>,
): Promise<T> => {
  const { data } = await client
    .post(`${checkPath(testRunId, checkId)}/${action}`, {
      ...body,
      ...(checkType != null ? { checkType } : {}),
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

const checkPath = (testRunId: string, checkId: string): string =>
  `agent/test-runs/${testRunId}/checks/${encodeURIComponent(checkId)}`;
