import { describe, expect, it } from "vitest";
import { startCallbackServer } from "../oauth-callback-server";

const completeLogin = async (server: { port: number }): Promise<string> => {
  const response = await fetch(
    `http://127.0.0.1:${server.port}/callback?code=abc&state=xyz`,
  );
  return await response.text();
};

describe("startCallbackServer success page", () => {
  it("shows the agent setup steps for a plain login", async () => {
    const server = await startCallbackServer();
    const [html] = await Promise.all([
      completeLogin(server),
      server.waitForCallback(),
    ]);

    expect(html).toContain("Authentication successful");
    expect(html).toContain("Using an AI coding agent?");
    expect(html).toContain("npx skills add alwaysmeticulous/skills");
  });

  // Onboard installs the CLI, MCP and skills itself, so repeating those steps
  // mid-run is what confused the customer.
  it("omits them when the caller is already onboarding", async () => {
    const server = await startCallbackServer({ showAgentSetup: false });
    const [html] = await Promise.all([
      completeLogin(server),
      server.waitForCallback(),
    ]);

    expect(html).toContain("Authentication successful");
    expect(html).toContain("return to the terminal");
    expect(html).not.toContain("Using an AI coding agent?");
    expect(html).not.toContain("npx skills add");
    expect(html).not.toContain("api/mcp");
  });
});
