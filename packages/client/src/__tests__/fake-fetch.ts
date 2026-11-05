export const fakeResponse = (
  status: number,
  statusText: string,
  body: unknown,
) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: {
    forEach: () => {},
    get: () => "application/json",
  },
  json: () => body,
  text: () => "",
});

const base64Url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export const jwtExpiringAt = (expSeconds: number): string =>
  `${base64Url({ alg: "RS256" })}.${base64Url({ exp: expSeconds })}.signature`;

export const VALID_JWT = jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600);
export const EXPIRED_JWT = jwtExpiringAt(Math.floor(Date.now() / 1000) - 3600);
