export const getApiToken: (apiToken: string | null | undefined) => string = (
  apiToken_
) => {
  if (apiToken_) {
    return apiToken_;
  }
  return process.env["METICULOUS_API_TOKEN"] || "[INVALID_TOKEN]";
};
