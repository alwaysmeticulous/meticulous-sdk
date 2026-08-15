import { describe, expect, it } from "vitest";
import {
  buildServerTimingSessionEntry,
  isProvisionalSessionIdCandidate,
  mintProvisionalSessionId,
} from "../provisional-session-id";
import { publishSessionIdOnResponse } from "../publish-session-id";

const headers =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

describe("mintProvisionalSessionId", () => {
  it("mints in the frontend recorder's `<ISO timestamp>_<nanoid>` format", () => {
    expect(mintProvisionalSessionId()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[A-Za-z0-9_-]{21}$/,
    );
  });

  it("mints a distinct id every time", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => mintProvisionalSessionId()),
    );
    expect(ids.size).toBe(100);
  });
});

describe("isProvisionalSessionIdCandidate", () => {
  it("mints for a document navigation", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "GET",
        headers({ "sec-fetch-dest": "document" }),
      ),
    ).toBe(true);
  });

  it("mints for a HEAD of a document", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "HEAD",
        headers({ "sec-fetch-dest": "document" }),
      ),
    ).toBe(true);
  });

  it("declines an in-page fetch, which is how an RSC navigation arrives", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "GET",
        headers({ "sec-fetch-dest": "empty", accept: "text/html" }),
      ),
    ).toBe(false);
  });

  it("declines a subframe — the top frame owns the session", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "GET",
        headers({ "sec-fetch-dest": "iframe" }),
      ),
    ).toBe(false);
  });

  it("falls back to Accept when Sec-Fetch-Dest is absent", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "GET",
        headers({ accept: "text/html,application/xhtml+xml" }),
      ),
    ).toBe(true);
  });

  it("declines a health check or crawler sending Accept: */*", () => {
    expect(
      isProvisionalSessionIdCandidate("GET", headers({ accept: "*/*" })),
    ).toBe(false);
  });

  it("declines a request giving no hints at all", () => {
    expect(isProvisionalSessionIdCandidate("GET", headers({}))).toBe(false);
  });

  it("declines a POST", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "POST",
        headers({ "sec-fetch-dest": "document" }),
      ),
    ).toBe(false);
  });

  it("declines a request that already names its session", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "GET",
        headers({
          "sec-fetch-dest": "document",
          "x-meticulous-session-id": "2026-08-12T10:00:00.000Z_abc",
        }),
      ),
    ).toBe(false);
  });

  it("is case-insensitive about the method", () => {
    expect(
      isProvisionalSessionIdCandidate(
        "get",
        headers({ "sec-fetch-dest": "document" }),
      ),
    ).toBe(true);
  });
});

describe("publishSessionIdOnResponse", () => {
  const sessionId = "2026-08-12T10:00:00.000Z_abcdefghijklmnopqrstu";
  const entry = buildServerTimingSessionEntry(sessionId);

  it("appends the metric to a mutable response, in place", () => {
    const response = new Response("<html></html>");
    const published = publishSessionIdOnResponse(response, sessionId);

    expect(published).toBe(response);
    expect(published.headers.get("server-timing")).toBe(entry);
  });

  it("keeps the app's own server timings alongside ours", () => {
    const response = new Response("<html></html>", {
      headers: { "server-timing": "db;dur=53" },
    });
    const published = publishSessionIdOnResponse(response, sessionId);

    expect(published.headers.get("server-timing")).toBe(`db;dur=53, ${entry}`);
  });

  it("rebuilds around the body when the headers are immutable", async () => {
    const response = new Response("<html>hello</html>", {
      headers: { "content-type": "text/html" },
    });
    // The guard a Response handed back by `fetch` or an assets binding carries.
    Object.defineProperty(response.headers, "append", {
      value: () => {
        throw new TypeError("immutable");
      },
    });

    const published = publishSessionIdOnResponse(response, sessionId);

    expect(published).not.toBe(response);
    expect(published.headers.get("server-timing")).toBe(entry);
    expect(published.headers.get("content-type")).toBe("text/html");
    expect(published.status).toBe(200);
    expect(await published.text()).toBe("<html>hello</html>");
  });

  it("leaves a WebSocket upgrade alone rather than rebuilding it", () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response.headers, "append", {
      value: () => {
        throw new TypeError("immutable");
      },
    });
    Object.defineProperty(response, "webSocket", { value: {} });

    expect(publishSessionIdOnResponse(response, sessionId)).toBe(response);
  });

  it("returns the response untouched when publishing is impossible", () => {
    const response = new Response("body");
    Object.defineProperty(response.headers, "append", {
      value: () => {
        throw new TypeError("immutable");
      },
    });
    // Nothing can be rebuilt from a response whose body has already been read.
    Object.defineProperty(response, "body", {
      get: () => {
        throw new TypeError("no body");
      },
    });

    expect(publishSessionIdOnResponse(response, sessionId)).toBe(response);
  });
});
