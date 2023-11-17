import { Cookie } from "@alwaysmeticulous/api";
import { Page, Protocol } from "puppeteer";

type ModifiedWindow = {
  __meticulous?: {
    getAllCookies?: () => Promise<Cookie[]>;
  };
};

export const provideCookieAccess = async (page: Page) => {
  const client = await page.target().createCDPSession();
  const cookies = (await client.send("Network.getAllCookies")).cookies.map(
    ({ sameSite, ...rest }): Cookie => {
      const convertedSameSite = convertSameSiteValue(sameSite);
      return {
        ...rest,
        ...(convertedSameSite ? { sameSite: convertedSameSite } : {}),
      };
    }
  );
  page.evaluateOnNewDocument((cookies) => {
    const meticulousObject = (window as ModifiedWindow).__meticulous ?? {};
    meticulousObject.getAllCookies = async () => {
      return cookies;
    };
    (window as ModifiedWindow).__meticulous = meticulousObject;
  }, cookies);
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
