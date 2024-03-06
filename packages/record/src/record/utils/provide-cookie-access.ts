import { Cookie } from "@alwaysmeticulous/api";
import { Page, Protocol } from "puppeteer";

type ModifiedWindow = {
  __meticulous?: {
    getAllCookies?: () => Promise<Cookie[]>;
  };
  __meticulous_getAllCookies?: () => Promise<Cookie[]>;
};

export const provideCookieAccess = async (page: Page) => {
  const client = await page.target().createCDPSession();
  const getCookies = async () =>
    (await client.send("Storage.getCookies")).cookies.map(
      ({ sameSite, expires, ...rest }): Cookie => {
        const convertedSameSite = convertSameSiteValue(sameSite);
        return {
          ...rest,
          ...(convertedSameSite ? { sameSite: convertedSameSite } : {}),
          expires: expires ? expires * 1000 : null, // Convert seconds to milliseconds
        };
      }
    );
  await page.exposeFunction("__meticulous_getAllCookies", getCookies);

  // The Meticulous recorder accesses the function via window.__meticulous.getAllCookies,
  // let's expose it there:
  page.evaluateOnNewDocument(() => {
    const meticulousObject = (window as ModifiedWindow).__meticulous ?? {};
    meticulousObject.getAllCookies = (
      window as ModifiedWindow
    ).__meticulous_getAllCookies!;
    (window as ModifiedWindow).__meticulous = meticulousObject;
  });
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
