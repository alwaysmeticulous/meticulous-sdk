import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import {
  redactCookiesAndHeaders,
  redactCookiesAndHeadersInJson,
} from "../generate-debug-workspace";

const baseDebugContext = (
  overrides: Partial<DebugContext> = {},
): DebugContext => ({
  testRunId: undefined,
  replayDiffs: [],
  replayIds: [],
  sessionIds: [],
  projectId: undefined,
  orgAndProject: "org/project",
  commitSha: undefined,
  baseCommitSha: undefined,
  testRunStatus: undefined,
  screenshot: undefined,
  meticulousSha: undefined,
  executionSha: undefined,
  ...overrides,
});

describe("redactCookiesAndHeadersInJson", () => {
  it("redacts session-level cookie values but preserves other fields", () => {
    const result = redactCookiesAndHeadersInJson({
      cookies: [
        { name: "session_id", value: "super-secret", domain: "example.com" },
      ],
    }) as { cookies: Array<Record<string, unknown>> };

    expect(result.cookies).toEqual([
      { name: "session_id", value: "<redacted>", domain: "example.com" },
    ]);
  });

  it("redacts nested HAR request/response header values", () => {
    const result = redactCookiesAndHeadersInJson({
      pollyHAR: {
        pollyHAR: {
          Meticulous_1: {
            log: {
              entries: [
                {
                  request: {
                    url: "https://example.com",
                    headers: [
                      { name: "Authorization", value: "Bearer secret-token" },
                      { name: "Cookie", value: "session=abc123" },
                    ],
                  },
                  response: {
                    status: 200,
                    headers: [
                      { name: "Set-Cookie", value: "session=abc123; Secure" },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const entry = result.pollyHAR.pollyHAR.Meticulous_1.log.entries[0];
    expect(entry.request.headers).toEqual([
      { name: "Authorization", value: "<redacted>" },
      { name: "Cookie", value: "<redacted>" },
    ]);
    expect(entry.response.headers).toEqual([
      { name: "Set-Cookie", value: "<redacted>" },
    ]);
    expect(entry.request.url).toBe("https://example.com");
    expect(entry.response.status).toBe(200);
  });

  it("redacts backend span http.request.header.* / http.response.header.* arrays", () => {
    const result = redactCookiesAndHeadersInJson({
      "http.request.header.cookie": ["session=abc123"],
      "http.response.header.set-cookie": ["session=abc123", "other=value"],
      "http.request.method": "GET",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result["http.request.header.cookie"]).toEqual(["<redacted>"]);
    expect(result["http.response.header.set-cookie"]).toEqual([
      "<redacted>",
      "<redacted>",
    ]);
    expect(result["http.request.method"]).toBe("GET");
  });

  it("redacts randomEvents.localStorage.state and sessionStorage.state values", () => {
    const result = redactCookiesAndHeadersInJson({
      randomEvents: {
        localStorage: { state: [{ key: "theme", value: "dark" }] },
        sessionStorage: {
          state: [{ key: "draft", value: "unsaved-secret-text" }],
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.randomEvents.localStorage.state).toEqual([
      { key: "theme", value: "<redacted>" },
    ]);
    expect(result.randomEvents.sessionStorage.state).toEqual([
      { key: "draft", value: "<redacted>" },
    ]);
  });

  it("redacts flat localStorageEntries / sessionStorageEntries arrays", () => {
    const result = redactCookiesAndHeadersInJson({
      applicationStorageDataOverride: {
        localStorageEntries: [{ key: "theme", value: "dark" }],
        sessionStorageEntries: [{ key: "draft", value: "unsaved-secret" }],
        indexedDbEntries: [],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.applicationStorageDataOverride.localStorageEntries).toEqual([
      { key: "theme", value: "<redacted>" },
    ]);
    expect(result.applicationStorageDataOverride.sessionStorageEntries).toEqual(
      [{ key: "draft", value: "<redacted>" }],
    );
  });

  it("does not redact unrelated key/value arrays that merely happen to be named 'state'", () => {
    const result = redactCookiesAndHeadersInJson({
      randomEvents: {
        indexedDb: { state: [{ key: "theme", value: "dark" }] },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.randomEvents.indexedDb.state).toEqual([
      { key: "theme", value: "dark" },
    ]);
  });

  it("treats the root value as a headers/cookies array when given the matching top-level key", () => {
    const result = redactCookiesAndHeadersInJson(
      [{ name: "session_id", value: "super-secret", domain: null }],
      "cookies",
    );

    expect(result).toEqual([
      { name: "session_id", value: "<redacted>", domain: null },
    ]);
  });

  it("redacts session.recordingToken and top-level recording_token scalars", () => {
    const result = redactCookiesAndHeadersInJson({
      session: {
        id: "session-1",
        recordingToken: "project-recording-token-plaintext",
      },
      recording_token: "project-recording-token-plaintext",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.session.recordingToken).toBe("<redacted>");
    expect(result.session.id).toBe("session-1");
    expect(result.recording_token).toBe("<redacted>");
  });

  it("redacts replayExecutionOptions.extraCookies / extraLocalStorageEntries / extraSessionStorageEntries", () => {
    const result = redactCookiesAndHeadersInJson({
      replayExecutionOptions: {
        extraCookies: [
          { name: "auth", value: "fixed-cookie-secret", domain: null },
        ],
        extraLocalStorageEntries: [
          { key: "token", value: "fixed-local-storage-secret" },
        ],
        extraSessionStorageEntries: [
          { key: "token", value: "fixed-session-storage-secret" },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.replayExecutionOptions.extraCookies).toEqual([
      { name: "auth", value: "<redacted>", domain: null },
    ]);
    expect(result.replayExecutionOptions.extraLocalStorageEntries).toEqual([
      { key: "token", value: "<redacted>" },
    ]);
    expect(result.replayExecutionOptions.extraSessionStorageEntries).toEqual([
      { key: "token", value: "<redacted>" },
    ]);
  });

  it("redacts replayExecutionOptions.customRequestHeaders' nested static value", () => {
    const result = redactCookiesAndHeadersInJson({
      replayExecutionOptions: {
        customRequestHeaders: [
          {
            name: "Authorization",
            value: { type: "static", value: "Bearer secret-api-key" },
            requestTargets: { type: "all" },
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(result.replayExecutionOptions.customRequestHeaders).toEqual([
      {
        name: "Authorization",
        value: { type: "static", value: "<redacted>" },
        requestTargets: { type: "all" },
      },
    ]);
  });
});

describe("redactCookiesAndHeaders", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-redact-cookies-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("redacts session data.json cookies, headers, and storage in place", () => {
    const sessionDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "sessions",
      "session-1",
    );
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, "data.json"),
      JSON.stringify({
        cookies: [
          { name: "auth", value: "top-secret", domain: null, expires: null },
        ],
        pollyHAR: {
          pollyHAR: {
            Meticulous_1: {
              log: {
                entries: [
                  {
                    request: {
                      url: "https://example.com",
                      headers: [{ name: "X-Api-Key", value: "abc" }],
                    },
                    response: { status: 200, headers: [] },
                  },
                ],
              },
            },
          },
        },
        randomEvents: {
          localStorage: { state: [{ key: "theme", value: "dark" }] },
          sessionStorage: {
            state: [{ key: "draft", value: "unsaved-secret" }],
          },
        },
        hostname: "example.com",
      }),
    );

    redactCookiesAndHeaders(
      baseDebugContext({ sessionIds: ["session-1"] }),
      workspace,
    );

    const written = JSON.parse(
      readFileSync(join(sessionDir, "data.json"), "utf8"),
    );
    expect(written.cookies[0].value).toBe("<redacted>");
    expect(written.cookies[0].name).toBe("auth");
    expect(
      written.pollyHAR.pollyHAR.Meticulous_1.log.entries[0].request.headers[0]
        .value,
    ).toBe("<redacted>");
    expect(written.randomEvents.localStorage.state[0]).toEqual({
      key: "theme",
      value: "<redacted>",
    });
    expect(written.randomEvents.sessionStorage.state[0]).toEqual({
      key: "draft",
      value: "<redacted>",
    });
    expect(written.hostname).toBe("example.com");
  });

  it("redacts launchBrowserAndReplayParams.json session.recordingToken and replayExecutionOptions extras", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "launchBrowserAndReplayParams.json"),
      JSON.stringify({
        session: {
          id: "session-1",
          recordingToken: "project-recording-token-plaintext",
        },
        replayExecutionOptions: {
          extraCookies: [
            { name: "auth", value: "fixed-cookie-secret", domain: null },
          ],
          extraLocalStorageEntries: [
            { key: "token", value: "fixed-local-storage-secret" },
          ],
          extraSessionStorageEntries: [
            { key: "token", value: "fixed-session-storage-secret" },
          ],
          customRequestHeaders: [
            {
              name: "Authorization",
              value: { type: "static", value: "Bearer secret-api-key" },
            },
          ],
        },
        appUrl: "https://example.com",
      }),
    );

    redactCookiesAndHeaders(baseDebugContext(), workspace);

    const written = JSON.parse(
      readFileSync(
        join(replayDir, "launchBrowserAndReplayParams.json"),
        "utf8",
      ),
    );
    expect(written.session.recordingToken).toBe("<redacted>");
    expect(written.session.id).toBe("session-1");
    expect(written.replayExecutionOptions.extraCookies[0].value).toBe(
      "<redacted>",
    );
    expect(
      written.replayExecutionOptions.extraLocalStorageEntries[0].value,
    ).toBe("<redacted>");
    expect(
      written.replayExecutionOptions.extraSessionStorageEntries[0].value,
    ).toBe("<redacted>");
    expect(
      written.replayExecutionOptions.customRequestHeaders[0].value.value,
    ).toBe("<redacted>");
    expect(written.appUrl).toBe("https://example.com");
  });

  it("redacts the top-level cookies.json array for each replay", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "cookies.json"),
      JSON.stringify([
        { name: "auth", value: "top-secret", domain: null, expires: null },
      ]),
    );

    redactCookiesAndHeaders(baseDebugContext(), workspace);

    const written = JSON.parse(
      readFileSync(join(replayDir, "cookies.json"), "utf8"),
    );
    expect(written).toEqual([
      { name: "auth", value: "<redacted>", domain: null, expires: null },
    ]);
  });

  it("redacts headers embedded in timeline.json network entries", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "timeline.json"),
      JSON.stringify([
        {
          kind: "pollyReplay",
          virtualTimeStart: 0,
          data: {
            pollyRequest: {
              request: {
                url: "https://example.com/api",
                headers: [{ name: "Cookie", value: "session_id=super-secret" }],
              },
              response: {
                status: 200,
                headers: [{ name: "Set-Cookie", value: "session_id=rotated" }],
              },
            },
            matchedRequest: null,
          },
        },
      ]),
    );

    redactCookiesAndHeaders(baseDebugContext(), workspace);

    const written = JSON.parse(
      readFileSync(join(replayDir, "timeline.json"), "utf8"),
    );
    expect(written[0].data.pollyRequest.request.headers[0]).toEqual({
      name: "Cookie",
      value: "<redacted>",
    });
    expect(written[0].data.pollyRequest.response.headers[0]).toEqual({
      name: "Set-Cookie",
      value: "<redacted>",
    });
    expect(written[0].kind).toBe("pollyReplay");
    expect(written[0].data.pollyRequest.request.url).toBe(
      "https://example.com/api",
    );
  });

  it("redacts a pre-existing timeline.ndjson in place, line by line", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    const entries = [
      {
        kind: "pollyReplay",
        data: {
          pollyRequest: {
            request: {
              url: "https://example.com",
              headers: [{ name: "Authorization", value: "Bearer secret" }],
            },
          },
        },
      },
      { kind: "screenshot", data: { identifier: "screenshot-1" } },
    ];
    writeFileSync(
      join(replayDir, "timeline.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );

    redactCookiesAndHeaders(baseDebugContext(), workspace);

    const writtenLines = readFileSync(
      join(replayDir, "timeline.ndjson"),
      "utf8",
    )
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
    expect(writtenLines[0].data.pollyRequest.request.headers[0].value).toBe(
      "<redacted>",
    );
    expect(writtenLines[1]).toEqual({
      kind: "screenshot",
      data: { identifier: "screenshot-1" },
    });
  });

  it("redacts custom-checks-snapshots/network-requests.json requestHeaders/responseHeaders", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    const snapshotsDir = join(replayDir, "custom-checks-snapshots");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(
      join(snapshotsDir, "network-requests.json"),
      JSON.stringify([
        {
          stageDuringSession: "final",
          data: {
            url: "https://example.com",
            method: "GET",
            requestHeaders: [
              { name: "Authorization", value: "Bearer secret-token" },
            ],
            status: 200,
            responseHeaders: [{ name: "Set-Cookie", value: "id=abc" }],
            matched: true,
          },
        },
      ]),
    );

    redactCookiesAndHeaders(baseDebugContext(), workspace);

    const written = JSON.parse(
      readFileSync(join(snapshotsDir, "network-requests.json"), "utf8"),
    );
    expect(written[0].data.requestHeaders[0].value).toBe("<redacted>");
    expect(written[0].data.responseHeaders[0].value).toBe("<redacted>");
    expect(written[0].data.url).toBe("https://example.com");
  });

  it("does nothing when no matching files exist", () => {
    expect(() =>
      redactCookiesAndHeaders(baseDebugContext(), workspace),
    ).not.toThrow();
  });
});
