import { describe, expect, it } from "vitest";
import { formatPollyReplayDetail } from "../format-polly-replay";

const har = (
  url: string,
  extra: Record<string, unknown> = {},
  postData?: string,
) => ({
  _order: 3,
  startedDateTime: "2026-10-20T17:04:30.123Z",
  request: {
    method: "POST",
    url,
    ...(postData ? { postData: { text: postData } } : {}),
  },
  response: { status: 200 },
  ...extra,
});

describe("formatPollyReplayDetail", () => {
  it("shows an exact match with its recording and GraphQL operation", () => {
    expect(
      formatPollyReplayDetail({
        result: "success",
        pollyRequest: har(
          "https://tunnel.example/graphql",
          {},
          JSON.stringify({ operationName: "GetUser" }),
        ),
        matchedRequest: har("https://app.example.com/graphql"),
        transformationsApplied: ["id"],
      }),
    ).toBe(
      "POST https://tunnel.example/graphql op=GetUser -> 200 (success) rec=#3@17:04:30.123 match=exact",
    );
  });

  it("tells a normalized match, as good as exact, from a loose one", () => {
    const withSteps = (steps: string[]) =>
      formatPollyReplayDetail({
        result: "success",
        pollyRequest: har("https://tunnel.example/api/me"),
        matchedRequest: har("https://app.example.com/api/me"),
        transformationsApplied: steps,
      });

    expect(withSteps(["id", "custom", "swap-start-url-origin"])).toContain(
      "match=normalized:swap-start-url-origin",
    );
    expect(
      withSteps([
        "id",
        "custom",
        "swap-start-url-origin",
        "drop-metadata-fields",
      ]),
    ).toContain("match=loose:drop-metadata-fields");
  });

  it("flags a response recorded for another path, and an ignored body", () => {
    expect(
      formatPollyReplayDetail({
        result: "success",
        pollyRequest: har("https://tunnel.example/api/deployments?page=1"),
        matchedRequest: har("https://app.example.com/api/tickets?status=open", {
          _meticulousNetworkPatched: "db-patch-direct",
        }),
        transformationsApplied: [
          "id",
          "drop-empty-like-body",
          "drop-body",
          "fuzzed-url-right-0",
        ],
      }),
    ).toBe(
      "POST https://tunnel.example/api/deployments?page=1 -> 200 (success) rec=#3@17:04:30.123 SERVED-OTHER-URL=/api/tickets?status=open match=loose:fuzzed-url-right-0 BODY-IGNORED repair=db-patch-direct",
    );
  });

  it("shows the match index's decision, and an unmatched request", () => {
    expect(
      formatPollyReplayDetail({
        result: "success",
        pollyRequest: har("https://tunnel.example/api/me"),
        matchedRequest: har("https://app.example.com/api/me"),
        matchIndex: { kind: "matched", parts: [] },
      }),
    ).toBe(
      "POST https://tunnel.example/api/me -> 200 (success) rec=#3@17:04:30.123 match=index:matched",
    );
    expect(
      formatPollyReplayDetail({
        result: "failure",
        pollyRequest: har("https://tunnel.example/api/new"),
        matchedRequest: null,
        matchIndex: { kind: "no-match", reason: "no-candidates", parts: [] },
      }),
    ).toBe(
      "POST https://tunnel.example/api/new -> (failure) match=index:no-match(no-candidates)",
    );
  });
});
