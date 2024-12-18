import { asterixOut } from "./asterix-out";

export const redactUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.password = asterixOut(parsedUrl.password);
    parsedUrl.username = asterixOut(parsedUrl.username);
    parsedUrl.hostname = "redacted.com";
    if (parsedUrl.hash.length > 0) {
      parsedUrl.hash = "redactedHash";
    }
    if (parsedUrl.pathname.length > 0) {
      parsedUrl.pathname = redactPath(parsedUrl.pathname);
    }
    if (parsedUrl.searchParams.size > 0) {
      const numParams = parsedUrl.searchParams.size;
      parsedUrl.searchParams.forEach((key) => {
        parsedUrl.searchParams.delete(key);
      });

      for (let i = 0; i < numParams; i++) {
        parsedUrl.searchParams.set(`redactedParam${i + 1}`, "redacted");
      }
    }
    return parsedUrl.toString();
  } catch (_e) {
    return asterixOut(url);
  }
};

export const redactPath = (path: string) => {
  return path.replace(/\/[^\/]+/g, "/redacted");
};
