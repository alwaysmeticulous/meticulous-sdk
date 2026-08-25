import type * as OAuthConstantsModule from "../oauth-constants";
import { describe, expect, it, vi } from "vitest";
import {
  CLI_LOGIN_INTENT_ONBOARD,
  buildAuthorizationUrl,
} from "../oauth-login";
import {
  CLI_CLIENT_ID,
  KEYCLOAK_ISSUER_URL,
  getWebappBaseUrl,
} from "../oauth-constants";

vi.mock("../oauth-constants", async (importOriginal) => {
  const actual = await importOriginal<typeof OAuthConstantsModule>();
  return {
    ...actual,
    getWebappBaseUrl: () => "https://app.meticulous.ai",
  };
});

describe("buildAuthorizationUrl", () => {
  const base = {
    codeChallenge: "challenge",
    state: "state",
    redirectUri: "http://127.0.0.1:1234/callback",
  };

  it("omits intent on a standard CLI login", () => {
    const url = new URL(buildAuthorizationUrl(base));
    expect(url.origin + url.pathname).toBe(`${getWebappBaseUrl()}/cli-login`);
    expect(url.searchParams.get("client_id")).toBe(CLI_CLIENT_ID);
    expect(url.searchParams.get("issuer")).toBe(KEYCLOAK_ISSUER_URL);
    expect(url.searchParams.get("intent")).toBeNull();
  });

  it("tags onboard logins so the page can hide the standard sign-in steps", () => {
    const url = new URL(
      buildAuthorizationUrl({ ...base, intent: CLI_LOGIN_INTENT_ONBOARD }),
    );
    expect(url.searchParams.get("intent")).toBe(CLI_LOGIN_INTENT_ONBOARD);
  });
});
