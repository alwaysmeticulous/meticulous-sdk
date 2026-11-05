import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import { getGraphQLOperationNames } from "./format-polly-replay";

const MAX_BODY_PREVIEW_LENGTH = 200;
const BODY_PREVIEW_SCAN_LENGTH = MAX_BODY_PREVIEW_LENGTH * 4;

interface RecordedRequest {
  _order?: number;
  startedDateTime?: string;
  _meticulousNetworkPatched?: string;
  request?: { url?: string; method?: string; postData?: { text?: string } };
  response?: {
    status?: number;
    content?: { text?: string; size?: number; encoding?: string };
  };
}

export interface SessionWithRequests {
  pollyHAR?: {
    pollyHAR?: Record<string, { log?: { entries?: RecordedRequest[] } }>;
  };
}

/**
 * Writes `session-requests/<sessionId>.txt` for a downloaded session (its
 * parsed `data.json`): every recorded network request on one line, keyed by
 * the `#<order>` that `network-log/` shows as `rec=#<order>` for the recording
 * a replayed request was served, followed by the requests recorded more than
 * once. Saves digging request and response bodies out of the session's
 * single-line `data.json`. Returns whether it wrote the file.
 */
export const writeSessionRequests = (
  workspaceDir: string,
  sessionId: string,
  session: SessionWithRequests,
): boolean => {
  try {
    const lines = formatSessionRequests(session);
    if (lines == null) {
      return false;
    }
    const outDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "session-requests");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${sessionId}.txt`), lines.join("\n") + "\n");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `  Warning: Could not index the requests of session ${sessionId}: ${message}`,
    );
    return false;
  }
};

export const formatSessionRequests = (
  session: SessionWithRequests,
): string[] | null => {
  const recordings = Object.entries(session.pollyHAR?.pollyHAR ?? {});
  const entries = recordings
    .flatMap(([recordingName, recording]) =>
      (recording?.log?.entries ?? []).map((entry) => ({
        entry,
        recordingName,
      })),
    )
    .sort(
      (a, b) =>
        (a.entry._order ?? Number.MAX_SAFE_INTEGER) -
        (b.entry._order ?? Number.MAX_SAFE_INTEGER),
    );
  if (entries.length === 0) {
    return null;
  }
  const showRecordingName = recordings.length > 1;

  const lines = [
    `Recorded network requests (${entries.length}), in recorded order. Format:`,
    "#<order> @<recorded time> METHOD URL [op=<GraphQL operation>] -> <status> [<response bytes>B] [patched=<source>] [req=<request body>] [res=<response body>]",
    `Bodies are cut at ${MAX_BODY_PREVIEW_LENGTH} characters; read the full ones from data.json, e.g.`,
    "jq '.pollyHAR.pollyHAR[].log.entries[] | select(._order == 12)' sessions/<id>/data.json",
    "",
  ];
  for (const { entry, recordingName } of entries) {
    lines.push(
      formatRecordedRequest(
        entry,
        showRecordingName ? recordingName : undefined,
      ),
    );
  }

  const repeated = findRepeatedRequests(entries.map(({ entry }) => entry));
  if (repeated.length > 0) {
    lines.push(
      "",
      `== Requests recorded more than once with the same method, URL and body (${repeated.length}). A replay`,
      "== serves their recordings in recorded order, so one call more or fewer shifts which recording each later call gets.",
      ...repeated.map(
        ({ key, orders }) =>
          `${key} x${orders.length}: ${orders.map((o) => `#${o}`).join(" ")}`,
      ),
    );
  }
  return lines;
};

const formatRecordedRequest = (
  entry: RecordedRequest,
  recordingName: string | undefined,
): string => {
  const url = entry.request?.url ?? "?";
  const requestBody = entry.request?.postData?.text;
  const operation = getGraphQLOperationNames(url, requestBody);
  const content = entry.response?.content;
  const parts = [
    `#${entry._order ?? "?"}`,
    ...(recordingName != null ? [`(${recordingName})`] : []),
    `@${entry.startedDateTime?.slice(11, 23) ?? "?"}`,
    entry.request?.method ?? "?",
    url,
    ...(operation ? [`op=${operation}`] : []),
    "->",
    `${entry.response?.status ?? "?"}`,
    ...(content?.size != null ? [`${content.size}B`] : []),
    ...(entry._meticulousNetworkPatched != null
      ? [`patched=${entry._meticulousNetworkPatched}`]
      : []),
    ...(requestBody ? [`req=${preview(requestBody)}`] : []),
    ...(content?.text && content.encoding !== "base64"
      ? [`res=${preview(content.text)}`]
      : []),
  ];
  return parts.join(" ");
};

/** Requests with the same method, full URL and request body. */
const findRepeatedRequests = (
  entries: RecordedRequest[],
): Array<{ key: string; orders: Array<number | string> }> => {
  const groups = new Map<
    string,
    { key: string; orders: Array<number | string> }
  >();
  for (const entry of entries) {
    const method = entry.request?.method ?? "?";
    const url = entry.request?.url ?? "?";
    const requestBody = entry.request?.postData?.text ?? "";
    const identity = JSON.stringify([method, url, requestBody]);
    const group = groups.get(identity);
    if (group != null) {
      group.orders.push(entry._order ?? "?");
      continue;
    }
    const operation = getGraphQLOperationNames(url, requestBody);
    groups.set(identity, {
      key: `${method} ${url}${operation ? ` op=${operation}` : ""}`,
      orders: [entry._order ?? "?"],
    });
  }
  return [...groups.values()].filter(({ orders }) => orders.length > 1);
};

const preview = (body: string): string => {
  // Only a prefix is collapsed, so a multi-MB body isn't scanned in full.
  const singleLine = body
    .slice(0, BODY_PREVIEW_SCAN_LENGTH)
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, " ");
  return singleLine.length > MAX_BODY_PREVIEW_LENGTH ||
    body.length > BODY_PREVIEW_SCAN_LENGTH
    ? `${singleLine.slice(0, MAX_BODY_PREVIEW_LENGTH)}...`
    : singleLine;
};
