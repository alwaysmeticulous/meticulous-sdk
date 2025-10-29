import { HarRequest } from "@alwaysmeticulous/api";
import { NetworkRequestMetadata } from "@alwaysmeticulous/sdk-bundles-api";
import { redactCookies } from "../redact-cookies";

describe("redactCookies", () => {
  const mockRequest: Omit<HarRequest, "queryString"> = {
    method: "GET",
    url: "https://api.example.com/data",
    headers: [],
  };

  const mockMetadata: NetworkRequestMetadata = {
    requestStartedAt: Date.now(),
  };

  it("should redact a single cookie value", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [{ name: "Cookie", value: "sessionId=abc123; other=value" }],
    };

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionid=******; SESSIONID=******" },
    ]);
  });

  it("should be case-insensitive for header names", () => {
    const middleware = redactCookies(["sessionId"]);
    const request: Omit<HarRequest, "queryString"> = {
      ...mockRequest,
      headers: [
        { name: "cookie", value: "sessionId=abc123" },
        { name: "Set-Cookie", value: "sessionId=xyz789" },
        { name: "SET-COOKIE", value: "sessionId=def456" },
      ],
    };

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
    expect(result!.headers).toEqual([
      { name: "cookie", value: "sessionId=******" },
      { name: "Set-Cookie", value: "sessionId=******" },
      { name: "SET-COOKIE", value: "sessionId=******" },
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
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

    const result = middleware.transformNetworkRequest!(request, mockMetadata);

    expect(result).not.toBeNull();
    expect(result!.headers).toEqual([
      { name: "Cookie", value: "sessionId=******; other = value" },
    ]);
  });

  it("should have applyRequestTransformationAtReplayTime set to false", () => {
    const middleware = redactCookies(["sessionId"]);

    expect(middleware.applyRequestTransformationAtReplayTime).toBe(false);
  });
});
