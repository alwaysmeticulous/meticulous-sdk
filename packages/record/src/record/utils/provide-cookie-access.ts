import { Cookie } from "@alwaysmeticulous/api";
import { Page } from "puppeteer";
import { convertCookieToMeticulous } from "./cookie-helpers";

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
      convertCookieToMeticulous
    );
  await page.exposeFunction("__meticulous_getAllCookies", getCookies);

  // The Meticulous recorder accesses the function via window.__meticulous.getAllCookies,
  // let's expose it there:
  await page.evaluateOnNewDocument(() => {
    const meticulousObject = (window as ModifiedWindow).__meticulous ?? {};
    meticulousObject.getAllCookies = (
      window as ModifiedWindow
    ).__meticulous_getAllCookies!;
    (window as ModifiedWindow).__meticulous = meticulousObject;
  });
};
