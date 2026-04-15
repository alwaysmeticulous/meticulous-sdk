import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  directDispatcher,
  proxyDispatcher,
  agentMock,
  proxyAgentMock,
  undiciFetchMock,
} = vi.hoisted(() => ({
  directDispatcher: { kind: "direct-dispatcher" },
  proxyDispatcher: { kind: "proxy-dispatcher" },
  agentMock: vi.fn(),
  proxyAgentMock: vi.fn(),
  undiciFetchMock: vi.fn(),
}));

vi.mock("undici", () => {
  return {
    Agent: function Agent() {
      agentMock();
      return directDispatcher;
    },
    ProxyAgent: function ProxyAgent() {
      proxyAgentMock();
      return proxyDispatcher;
    },
    fetch: undiciFetchMock,
  };
});

describe("meticulousFetch", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
    };
    delete process.env["HTTP_PROXY"];
    delete process.env["http_proxy"];
    delete process.env["HTTPS_PROXY"];
    delete process.env["https_proxy"];
    delete process.env["NO_PROXY"];
    delete process.env["no_proxy"];
    agentMock.mockClear();
    proxyAgentMock.mockClear();
    undiciFetchMock.mockReset();
  });

  it("uses the direct dispatcher when no proxy is configured", async () => {
    const response = { ok: true };
    undiciFetchMock.mockResolvedValue(response);

    const { meticulousFetch } = await import("../src/fetch.utils");

    const init = {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    };

    await expect(
      meticulousFetch("https://example.com/test", init),
    ).resolves.toBe(response as never);
    expect(agentMock).toHaveBeenCalledTimes(1);
    expect(proxyAgentMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledWith(
      "https://example.com/test",
      {
        ...init,
        dispatcher: directDispatcher,
      },
    );
  });

  it("uses a proxy dispatcher when proxy env vars are configured", async () => {
    process.env["HTTPS_PROXY"] = "http://proxy.internal:8080";

    const response = { ok: true };
    undiciFetchMock.mockResolvedValue(response);

    const { meticulousFetch } = await import("../src/fetch.utils");

    await expect(
      meticulousFetch("https://example.com/test"),
    ).resolves.toBe(response as never);
    expect(agentMock).not.toHaveBeenCalled();
    expect(proxyAgentMock).toHaveBeenCalledTimes(1);
    expect(undiciFetchMock).toHaveBeenCalledWith(
      "https://example.com/test",
      {
        dispatcher: proxyDispatcher,
      },
    );
  });
});
