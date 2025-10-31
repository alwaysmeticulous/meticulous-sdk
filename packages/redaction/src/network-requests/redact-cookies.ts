import { RecorderMiddleware } from "@alwaysmeticulous/sdk-bundles-api";

/**
 * Redacts cookie values from network requests during recording, by replacing them with asterisks.
 *
 * Has two modes:
 * default-redact: will redact *all* cookies except those in the exceptionsList.
 * default-keep: will redact *only* cookies in the exceptionsList.
 *
 * @param cookieNames - Array of cookie names to redact.
 */
export const redactCookies = (
  mode: "default-redact" | "default-keep",
  exceptionsList: string[],
): RecorderMiddleware => {
  const lcExceptionsList = exceptionsList.map((n) => n.toLowerCase());

  function redactCookieValue(
    cookieHeaderValue: string,
    isSetCookie: boolean = false,
  ) {
    const cookies = cookieHeaderValue.split(";").map((cookie) => cookie.trim());
    return cookies
      .map((cookie, index) => {
        // if this a set-cookie header, then the cookie value leads and all other segments are the cookie attributes
        if (isSetCookie && index !== 0) {
          return cookie;
        }

        const equalsIndex = cookie.indexOf("=");
        if (equalsIndex === -1) {
          return cookie; // Cookie without value
        }
        const cookieName = cookie.substring(0, equalsIndex).trim();

        if (
          (mode === "default-keep" &&
            lcExceptionsList.includes(cookieName.toLowerCase())) ||
          (mode === "default-redact" &&
            !lcExceptionsList.includes(cookieName.toLowerCase()))
        ) {
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
          if (header.name.toLowerCase() === "cookie") {
            return {
              ...header,
              value: redactCookieValue(header.value),
            };
          }
          return header;
        }),
      };
    },

    transformNetworkResponse: (response) => {
      return {
        ...response,
        headers: response.headers.map((header) => {
          if (header.name.toLowerCase() === "set-cookie") {
            return {
              ...header,
              value: redactCookieValue(header.value, true),
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
