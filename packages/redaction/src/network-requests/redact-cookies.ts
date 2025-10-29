import { RecorderMiddleware } from "@alwaysmeticulous/sdk-bundles-api";

/**
 * Redacts cookie values from network requests by replacing them with asterisks.
 *
 * @param cookieNames - Array of cookie names to redact.
 */
export const redactCookies = (
  cookieNamesToRedact: string[],
): RecorderMiddleware => {
  const lcCookieNamesToRedact = cookieNamesToRedact.map((n) => n.toLowerCase());
  function redactCookieHeaderValue(cookieHeaderValue: string) {
    const cookies = cookieHeaderValue.split(";").map((cookie) => cookie.trim());
    return cookies
      .map((cookie) => {
        const equalsIndex = cookie.indexOf("=");
        if (equalsIndex === -1) {
          return cookie; // Cookie without value
        }
        const cookieName = cookie.substring(0, equalsIndex).trim();
        if (lcCookieNamesToRedact.includes(cookieName.toLowerCase())) {
          return `${cookieName}=******`;
        }

        // Return original cookie if not in redaction list
        return cookie;
      })
      .join("; ");
  }

  return {
    transformNetworkRequest: (request) => {
      return {
        ...request,
        headers: request.headers.map((header) => {
          if (["cookie", "set-cookie"].includes(header.name.toLowerCase())) {
            return {
              ...header,
              value: redactCookieHeaderValue(header.value),
            };
          }
          return header;
        }),
      };
    },

    // We're only transforming headers so don't need to apply the transformation at replay time
    applyRequestTransformationAtReplayTime: false,
  };
};
