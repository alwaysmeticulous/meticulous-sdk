const MAX_URL_LENGTH = 120;
const MAX_BODY_PARSE_LENGTH = 200_000;

// Matching-ladder step names, from network matching's transformations.
const UNMATCHED_ATOMIC_OPERATION = "unmatched-atomic-operation";
const IDENTITY_STEP = "id";
// The ladder's "light" steps: they only normalise what never identifies a
// response (the replay's host, timestamps, JSON key order, empty bodies), so a
// match found by one is as good as exact. Any other step is a loose match.
const NORMALIZING_STEPS: ReadonlySet<string> = new Set([
  "custom",
  "swap-start-url-origin",
  "swap-start-url-same-hostname-cross-origin",
  "apply-custom-recorder-middleware",
  "url-decode-path",
  "drop-generic-path-prefixes",
  "replace-hostname-with-best-possible",
  "uniform-recent-ts",
  "uniform-limits-offsets",
  "drop-nextjs-buildid",
  "drop-port-and-protocol",
  "canonicalize-json-body",
  "canonicalize-trpc-input-location",
  "drop-empty-like-body",
  "drop-content-type",
  "drop-query-and-extensions-from-graphql",
]);
const LOOSE_MATCH_MARKERS: ReadonlyArray<[string, readonly string[]]> = [
  ["BODY-IGNORED", ["drop-body", "drop-body-from-graphql"]],
  ["QUERY-IGNORED", ["drop-query"]],
  ["PARTIAL-BATCH", [UNMATCHED_ATOMIC_OPERATION]],
];

interface HarLikeEntry {
  _order?: number;
  startedDateTime?: string;
  _meticulousNetworkPatched?: string;
  request?: { url?: string; method?: string; postData?: { text?: string } };
  response?: { status?: number };
}

interface MatchIndexDecision {
  kind?: string;
  reason?: string;
}

/**
 * One `pollyReplay` (network stub) entry as a single line: the request, the
 * recorded response it was served, and how that recording was matched, so a
 * wrong match is visible without opening `timeline.ndjson`.
 *
 * `match=` is `exact`, `normalized:<step>` (as good as exact) or
 * `loose:<step>`. `SERVED-OTHER-URL=` marks a response recorded for a
 * different path, `BODY-IGNORED` / `QUERY-IGNORED` a match that ignored the
 * request body or query string, and `PARTIAL-BATCH` a batch with operations
 * left unmatched.
 */
export const formatPollyReplayDetail = (
  data: Record<string, unknown>,
): string => {
  const polly = (data.pollyRequest as HarLikeEntry | undefined) ?? {};
  const matched = data.matchedRequest as HarLikeEntry | null | undefined;
  const request = polly.request ?? {};
  const url = String(request.url ?? "?");
  const operation = getGraphQLOperationNames(url, request.postData?.text);

  const parts = [
    `${request.method ?? "?"} ${truncate(url, MAX_URL_LENGTH)}`,
    ...(operation ? [`op=${operation}`] : []),
    "->",
    ...(matched?.response?.status != null
      ? [`${matched.response.status}`]
      : []),
    `(${typeof data.result === "string" ? data.result : "?"})`,
  ];

  if (matched != null) {
    parts.push(...formatRecording(matched));
    const matchedUrl = matched.request?.url;
    if (matchedUrl != null && getPath(matchedUrl) !== getPath(url)) {
      parts.push(
        `SERVED-OTHER-URL=${truncate(getPathAndQuery(matchedUrl), MAX_URL_LENGTH)}`,
      );
    }
  }

  parts.push(...formatMatchMethod(data));

  const repair = data.repairSource ?? matched?._meticulousNetworkPatched;
  if (typeof repair === "string") {
    parts.push(`repair=${repair}`);
  }
  return parts.join(" ");
};

const formatRecording = (matched: HarLikeEntry): string[] => {
  const time = matched.startedDateTime?.slice(11, 23);
  if (matched._order == null && !time) {
    return [];
  }
  return [`rec=#${matched._order ?? "?"}${time ? `@${time}` : ""}`];
};

const formatMatchMethod = (data: Record<string, unknown>): string[] => {
  const parts: string[] = [];
  const transformations = data.transformationsApplied;
  if (Array.isArray(transformations)) {
    const steps = transformations.map(String);
    // The matching ladder is cumulative: every step up to the one that found a
    // recording is listed, so the last step says how far matching was loosened.
    const deciding = steps.filter((s) => s !== UNMATCHED_ATOMIC_OPERATION);
    parts.push(formatMatchStep(deciding[deciding.length - 1]));
    for (const [marker, markerSteps] of LOOSE_MATCH_MARKERS) {
      if (steps.some((s) => markerSteps.includes(s))) {
        parts.push(marker);
      }
    }
  }
  const index = data.matchIndex as MatchIndexDecision | undefined;
  if (index?.kind != null) {
    parts.push(`match=index:${formatDecision(index)}`);
  }
  const fallback = data.matchIndexFallback as MatchIndexDecision | undefined;
  if (fallback?.kind != null) {
    parts.push(`index-declined=${formatDecision(fallback)}`);
  }
  return parts;
};

const formatMatchStep = (step: string | undefined): string => {
  if (step == null || step === IDENTITY_STEP) {
    return "match=exact";
  }
  return NORMALIZING_STEPS.has(step)
    ? `match=normalized:${step}`
    : `match=loose:${step}`;
};

const formatDecision = (decision: MatchIndexDecision): string =>
  decision.reason ? `${decision.kind}(${decision.reason})` : `${decision.kind}`;

const getGraphQLOperationNames = (
  url: string,
  body: string | undefined,
): string | undefined => {
  if (body != null && body.length <= MAX_BODY_PARSE_LENGTH) {
    try {
      const parsed: unknown = JSON.parse(body);
      const operations = (Array.isArray(parsed) ? parsed : [parsed])
        .map((op: unknown) =>
          op != null && typeof op === "object"
            ? (op as { operationName?: unknown }).operationName
            : undefined,
        )
        .filter((name): name is string => typeof name === "string");
      if (operations.length > 0) {
        return operations.join(",");
      }
    } catch {
      // Not a JSON body.
    }
  }
  return parseUrl(url)?.searchParams.get("operationName") ?? undefined;
};

const parseUrl = (url: string): URL | undefined => {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
};

// Paths rather than whole URLs: the replayed app's host (a tunnel) never
// matches the recorded one.
const getPath = (url: string): string =>
  parseUrl(url)?.pathname ?? url.split("?")[0];

const getPathAndQuery = (url: string): string => {
  const parsed = parseUrl(url);
  return parsed ? `${parsed.pathname}${parsed.search}` : url;
};

const truncate = (s: string, maxLen: number): string =>
  s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
