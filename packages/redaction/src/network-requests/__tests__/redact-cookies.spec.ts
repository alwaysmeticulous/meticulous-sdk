import { HarRequest, HarResponse } from "@alwaysmeticulous/api";
import { redactCookies } from "../redact-cookies";

describe("redactCookies", () => {
  const mockRequest: Omit<HarRequest, "queryString"> = {
    method: "GET",
    url: "https://api.example.com/data",
    headers: [],
  };

  const mockResponse: HarResponse = {
    status: 200,
    headers: [],
    content: {
      mimeType: "application/json",
    },
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

  it("should redact Set-Cookie headers in responses", () => {
    const middleware = redactCookies(["sessionId"]);
    const response: HarResponse = {
      ...mockResponse,
      headers: [
        { name: "Set-Cookie", value: "sessionId=abc123; Path=/; HttpOnly" },
        { name: "Content-Type", value: "application/json" },
      ],
    };

    const result = middleware.transformNetworkResponse!(response, {} as any);

    expect(result.headers).toEqual([
      { name: "Set-Cookie", value: "sessionId=******; Path=/; HttpOnly" },
      { name: "Content-Type", value: "application/json" },
    ]);
  });

  it("should redact multiple Set-Cookie headers in responses", () => {
    const middleware = redactCookies(["sessionId", "authToken"]);
    const response: HarResponse = {
      ...mockResponse,
      headers: [
        { name: "Set-Cookie", value: "sessionId=abc123; Path=/" },
        { name: "Set-Cookie", value: "authToken=xyz789; Path=/" },
        { name: "Set-Cookie", value: "other=value; Path=/" },
      ],
    };

    const result = middleware.transformNetworkResponse!(response, {} as any);

    expect(result.headers).toEqual([
      { name: "Set-Cookie", value: "sessionId=******; Path=/" },
      { name: "Set-Cookie", value: "authToken=******; Path=/" },
      { name: "Set-Cookie", value: "other=value; Path=/" },
    ]);
  });

  it("should be case-insensitive for set-cookie header name in responses", () => {
    const middleware = redactCookies(["sessionId"]);
    const response: HarResponse = {
      ...mockResponse,
      headers: [
        { name: "set-cookie", value: "sessionId=abc123" },
        { name: "Set-Cookie", value: "sessionId=xyz789" },
        { name: "SET-COOKIE", value: "sessionId=def456" },
      ],
    };

    const result = middleware.transformNetworkResponse!(response, {} as any);

    expect(result.headers).toEqual([
      { name: "set-cookie", value: "sessionId=******" },
      { name: "Set-Cookie", value: "sessionId=******" },
      { name: "SET-COOKIE", value: "sessionId=******" },
    ]);
  });

  it("should leave non-Set-Cookie headers unchanged in responses", () => {
    const middleware = redactCookies(["sessionId"]);
    const response: HarResponse = {
      ...mockResponse,
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "Cache-Control", value: "no-cache" },
        { name: "Set-Cookie", value: "sessionId=abc123" },
      ],
    };

    const result = middleware.transformNetworkResponse!(response, {} as any);

    expect(result.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "Cache-Control", value: "no-cache" },
      { name: "Set-Cookie", value: "sessionId=******" },
    ]);
  });

  it("should handle responses with no Set-Cookie headers", () => {
    const middleware = redactCookies(["sessionId"]);
    const response: HarResponse = {
      ...mockResponse,
      headers: [{ name: "Content-Type", value: "application/json" }],
    };

    const result = middleware.transformNetworkResponse!(response, {} as any);

    expect(result.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
    ]);
  });

  it("should have applyRequestTransformationAtReplayTime set to false", () => {
    const middleware = redactCookies(["sessionId"]);

    expect(middleware.applyRequestTransformationAtReplayTime).toBe(false);
  });
});
