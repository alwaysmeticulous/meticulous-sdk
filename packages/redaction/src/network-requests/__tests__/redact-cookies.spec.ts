import { HarRequest } from "@alwaysmeticulous/api";
import { redactCookies } from "../redact-cookies";

describe("redactCookies", () => {
  const mockRequest: Omit<HarRequest, "queryString"> = {
    method: "GET",
    url: "https://api.example.com/data",
    headers: [],
  };

  it("should redact a single cookie value", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [{ name: "Cookie", value: "sessionId=abc123; other=value" }],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionId=******; other=value" },
    ]);
  });

  it("should redact multiple cookie values", () => {
    const middleware = redactCookies(["sessionId", "authToken"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        {
          name: "Cookie",
          value: "sessionId=abc123; authToken=xyz789; other=value",
        },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      {
        name: "Cookie",
        value: "sessionId=******; authToken=******; other=value",
      },
    ]);
  });

  it("should be case-insensitive for cookie names", () => {
    const middleware = redactCookies(["SessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "Cookie", value: "sessionid=abc123; SESSIONID=xyz789" },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionid=******; SESSIONID=******" },
    ]);
  });

  it("should be case-insensitive for cookie header name in requests", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "cookie", value: "sessionId=abc123" },
        { name: "Cookie", value: "sessionId=xyz789" },
        { name: "COOKIE", value: "sessionId=def456" },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "cookie", value: "sessionId=******" },
      { name: "Cookie", value: "sessionId=******" },
      { name: "COOKIE", value: "sessionId=******" },
    ]);
  });

  it("should leave non-cookie headers unchanged", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "Authorization", value: "Bearer token123" },
        { name: "Content-Type", value: "application/json" },
        { name: "Cookie", value: "sessionId=abc123" },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Authorization", value: "Bearer token123" },
      { name: "Content-Type", value: "application/json" },
      { name: "Cookie", value: "sessionId=******" },
    ]);
  });

  it("should handle cookies without values", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "Cookie", value: "sessionId=abc123; flagCookie; other=value" },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionId=******; flagCookie; other=value" },
    ]);
  });

  it("should handle empty cookie list", () => {
    const middleware = redactCookies([]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [{ name: "Cookie", value: "sessionId=abc123; other=value" }],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionId=abc123; other=value" },
    ]);
  });

  it("should handle request with no cookie headers", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [{ name: "Authorization", value: "Bearer token123" }],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Authorization", value: "Bearer token123" },
    ]);
  });

  it("should handle cookies with whitespace", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "Cookie", value: "  sessionId = abc123  ;  other = value  " },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, {} as any);

    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionId=******; other = value" },
    ]);
  });

  it("should have applyRequestTransformationAtReplayTime set to false", () => {
    const middleware = redactCookies(["sessionId"]);

    expect(middleware.applyRequestTransformationAtReplayTime).toBe(false);
  });
});
