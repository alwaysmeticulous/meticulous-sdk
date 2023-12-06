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
    (await client.send("Network.getAllCookies")).cookies.map(
      ({ sameSite, ...rest }): Cookie => {
        const convertedSameSite = convertSameSiteValue(sameSite);
        return {
          ...rest,
          ...(convertedSameSite ? { sameSite: convertedSameSite } : {}),
        };
      }
    );
  await page.exposeFunction("__meticulous_getAllCookies", getCookies);
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
