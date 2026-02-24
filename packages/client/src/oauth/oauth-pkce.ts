import { randomBytes, createHash } from "crypto";

export const generateCodeVerifier = (): string => {
  return randomBytes(32).toString("base64url");
};

export const generateCodeChallenge = (verifier: string): string => {
  return createHash("sha256").update(verifier).digest("base64url");
};

export const generateState = (): string => {
  return randomBytes(16).toString("base64url");
};
