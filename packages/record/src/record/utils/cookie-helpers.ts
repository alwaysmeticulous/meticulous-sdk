import { Cookie } from "@alwaysmeticulous/api";
import { Protocol } from "puppeteer";

export const convertCookieToMeticulous = ({
  sameSite,
  expires,
  ...rest
}: Protocol.Network.Cookie): Cookie => {
  const convertedSameSite = convertSameSiteValue(sameSite);
  return {
    ...rest,
    ...(convertedSameSite ? { sameSite: convertedSameSite } : {}),
    expires: expires ? expires * 1000 : null,
  };
};

const convertSameSiteValue = (
  sameSite: Protocol.Network.CookieSameSite | undefined
) => {
  switch (sameSite) {
    case "None":
      return "none";
    case "Lax":
      return "lax";
    case "Strict":
      return "strict";
    default:
      return undefined;
  }
};
