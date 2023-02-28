import { SessionData } from "@alwaysmeticulous/api";

export const isSSRPage: (sessionData: SessionData) => boolean = (sessionData) =>
  !!sessionData.applicationSpecificData?.nextJs?.props?.__N_SSP;

export const getNextJs404PageUrl: (startUrl: string) => string = (startUrl) => {
  const url = new URL(startUrl);
  // _error will always be a 404 page in Next.JS. See https://nextjs.org/docs/advanced-features/custom-error-page#caveats
  url.pathname = "/_error";
  return url.toString();
};
