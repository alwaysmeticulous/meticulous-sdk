import { describe, expect, it } from "vitest";
import { HarResponse } from "@alwaysmeticulous/api";
import { NetworkResponseMetadata } from "@alwaysmeticulous/sdk-bundles-api";
import { transformJsonResponse } from "../transform-json-response";

interface MockResponse {
  sensitive: string;
  public: string;
}

describe("transformJsonResponse", () => {
  const mockResponse: HarResponse = {
    content: {
      mimeType: "application/json",
      text: JSON.stringify({ sensitive: "data", public: "info" }),
    },
    status: 200,
    headers: [],
  };

  const mockMetadata: NetworkResponseMetadata = {
    request: {
      url: "https://api.example.com/data",
    } as any,
    requestStartedAt: 0,
    responseReceivedAt: 0,
  };

  it("should redact sensitive data from JSON response if no URL regex", () => {
    const middleware = transformJsonResponse<MockResponse>({
      transform: (data) => {
        return { ...data, sensitive: "<REDACTED>" };
      },
    });

    const result = middleware.transformNetworkResponse!(
      mockResponse,
      mockMetadata
    );

    expect(JSON.parse(result!.content.text!)).toEqual({
      sensitive: "<REDACTED>",
      public: "info",
    });
  });

  it("should redact sensitive data from JSON response if URL does match regex", () => {
    const middleware = transformJsonResponse<MockResponse>({
      urlRegExp: /^https:\/\/api\.example\.com\/data/,
      transform: (data) => {
        return { ...data, sensitive: "<REDACTED>" };
      },
    });

    const result = middleware.transformNetworkResponse!(
      mockResponse,
      mockMetadata
    );

    expect(JSON.parse(result!.content.text!)).toEqual({
      sensitive: "<REDACTED>",
      public: "info",
    });
  });

  it("should not redact if URL does not match regex", () => {
    const middleware = transformJsonResponse<MockResponse>({
      urlRegExp: /^https:\/\/api\.example\.com\/sensitive/,
      transform: (data) => {
        return { ...data, sensitive: "<REDACTED>" };
      },
    });

    const result = middleware.transformNetworkResponse!(
      mockResponse,
      mockMetadata
    );

    expect(result).toBe(mockResponse);
  });

  it("should handle non-JSON responses based on skipRedactionIfNotValidJSON", () => {
    const nonJsonResponse: HarResponse = {
      content: {
        mimeType: "text/plain",
        text: "Not a JSON string",
      },
      status: 200,
      headers: [],
    };

    const middlewareSkip = transformJsonResponse<MockResponse>({
      skipRedactionIfNotValidJSON: true,
      transform: (data) => data,
    });

    const resultSkip = middlewareSkip.transformNetworkResponse!(
      nonJsonResponse,
      mockMetadata
    );
    expect(resultSkip).toBe(nonJsonResponse);

    const middlewareRedact = transformJsonResponse<MockResponse>({
      skipRedactionIfNotValidJSON: false,
      transform: (data) => data,
    });

    const resultRedact = middlewareRedact.transformNetworkResponse!(
      nonJsonResponse,
      mockMetadata
    );
    expect(resultRedact!.content.text).toBe("<REDACTED>");
  });
});
