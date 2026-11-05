import { describe, expect, it } from "vitest";
import { describeSessionVariant } from "../describe-session-variant";
import { formatSessionRequests } from "../generate-session-requests";

const session = {
  pollyHAR: {
    pollyHAR: {
      Meticulous_1: {
        log: {
          entries: [
            {
              _order: 2,
              startedDateTime: "2026-10-27T18:15:11.596Z",
              request: {
                method: "POST",
                url: "https://app.example.com/graphql",
                postData: {
                  text: '{"operationName":"GetUser","variables":{"id":"u1"}}',
                },
              },
              response: {
                status: 200,
                content: { size: 17, text: '{"data":\n{"id":1}}' },
              },
            },
            {
              _order: 0,
              startedDateTime: "2026-10-27T18:15:10.001Z",
              request: {
                method: "GET",
                url: "https://app.example.com/api/items?page=1",
              },
              response: { status: 200, content: { text: "[]" } },
            },
            {
              _order: 1,
              startedDateTime: "2026-10-27T18:15:10.500Z",
              _meticulousNetworkPatched: "db-patch-direct",
              request: {
                method: "GET",
                url: "https://app.example.com/api/items?page=2",
              },
              response: {
                status: 200,
                content: { encoding: "base64", text: "AAAA" },
              },
            },
          ],
        },
      },
    },
  },
};

describe("formatSessionRequests", () => {
  it("lists recordings in recorded order", () => {
    const lines = formatSessionRequests(session) ?? [];
    const body = lines.slice(lines.indexOf("") + 1);

    expect(body).toEqual([
      "#0 @18:15:10.001 GET https://app.example.com/api/items?page=1 -> 200 res=[]",
      "#1 @18:15:10.500 GET https://app.example.com/api/items?page=2 -> 200 patched=db-patch-direct",
      '#2 @18:15:11.596 POST https://app.example.com/graphql op=GetUser -> 200 17B req={"operationName":"GetUser","variables":{"id":"u1"}} res={"data": {"id":1}}',
    ]);
  });

  it("lists the requests recorded more than once with the same method, URL and body", () => {
    const request = (order: number, url: string, requestBody?: string) => ({
      _order: order,
      request: {
        method: requestBody != null ? "POST" : "GET",
        url,
        ...(requestBody != null ? { postData: { text: requestBody } } : {}),
      },
      response: { status: 200 },
    });
    const getUser = (id: string) =>
      JSON.stringify({ operationName: "GetUser", variables: { id } });

    const lines =
      formatSessionRequests({
        pollyHAR: {
          pollyHAR: {
            Meticulous_1: {
              log: {
                entries: [
                  request(0, "https://app.example.com/api/items?page=1"),
                  request(1, "https://app.example.com/api/items?page=2"),
                  request(2, "https://app.example.com/api/items?page=1"),
                  request(3, "https://app.example.com/graphql", getUser("u1")),
                  request(4, "https://app.example.com/graphql", getUser("u2")),
                  request(5, "https://app.example.com/graphql", getUser("u1")),
                ],
              },
            },
          },
        },
      }) ?? [];

    expect(lines.slice(lines.lastIndexOf("") + 3)).toEqual([
      "GET https://app.example.com/api/items?page=1 x2: #0 #2",
      "POST https://app.example.com/graphql op=GetUser x2: #3 #5",
    ]);
  });

  it("cuts long bodies", () => {
    const longBody = `{"a":"${"x".repeat(10_000)}"}`;
    const lines =
      formatSessionRequests({
        pollyHAR: {
          pollyHAR: {
            Meticulous_1: {
              log: {
                entries: [
                  {
                    _order: 0,
                    request: { method: "GET", url: "https://a.test/" },
                    response: { status: 200, content: { text: longBody } },
                  },
                ],
              },
            },
          },
        },
      }) ?? [];

    expect(lines.at(-1)).toBe(
      `#0 @? GET https://a.test/ -> 200 res=${longBody.slice(0, 200)}...`,
    );
  });

  it("returns null for a session without recorded requests", () => {
    expect(formatSessionRequests({})).toBeNull();
  });
});

describe("describeSessionVariant", () => {
  it("says nothing for an original recording", () => {
    expect(describeSessionVariant("abc", {})).toEqual([]);
  });

  it("lists every modification of a session derived more than once, in order", () => {
    const lines = describeSessionVariant(
      "abc_p1790872048248_mutbaa64f19_p1793125354765",
      {},
    );

    expect(lines.slice(1, 4).map((line) => line.split(":")[0])).toEqual([
      "  - patched (_p, 2026-10-01T16",
      "  - mutated (_mut)",
      "  - patched (_p, 2026-10-27T18",
    ]);
  });

  it("describes an auxiliary-viewport copy", () => {
    const lines = describeSessionVariant("abc_aux7b2fe4f7_p1793125354765", {});

    expect(lines.slice(1, 3).map((line) => line.split(":")[0])).toEqual([
      "  - auxiliary-viewport copy (_aux)",
      "  - patched (_p, 2026-10-27T18",
    ]);
  });

  it("describes each modification of a derived session", () => {
    const lines = describeSessionVariant("abc_mut7b2fe4f7_p1793125354765", {
      ...session,
      context: { mutationMayInvalidateRecordedFeatureFlags: true },
    });

    expect(lines[0]).toBe(
      "Modified by Meticulous: this is not the user's original recording.",
    );
    expect(lines.join("\n")).toContain("patched (_p, 2026-10-27T");
    expect(lines.join("\n")).toContain("mutated (_mut)");
    expect(lines.join("\n")).toContain("recorded feature flags may not match");
    expect(lines.join("\n")).toContain(
      "1 recorded responses were patched or generated",
    );
  });
});
