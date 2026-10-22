export interface SecretPattern {
  name: string;
  regex: RegExp;
  /** `$<name>` groups to keep around the redaction marker. */
  replacement: string;
}

/**
 * Character class for secret values. It excludes quotes and backslashes, so
 * matching inside JSON text (transcripts are JSON, and their strings hold
 * escaped JSON) never swallows a delimiter or half an escape sequence, and
 * the redacted text stays valid JSON.
 */
const VALUE = String.raw`[A-Za-z0-9_\-./+=]`;

const marker = (name: string) => `[REDACTED:${name}]`;

const token = (name: string, source: string): SecretPattern => ({
  name,
  regex: new RegExp(source, "g"),
  replacement: marker(name),
});

/**
 * Cloud agents routinely print their environment into transcripts. These
 * cover credentials with recognisable shapes plus `NAME=value` assignments
 * whose name says it's a secret; they're deliberately conservative, since a
 * false positive mangles the trace.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  token(
    "private-key",
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`,
  ),
  token("meticulous-ingest-token", String.raw`\batit-[A-Za-z0-9_-]{16,}`),
  token("meticulous-api-token", String.raw`\bprat-[A-Za-z0-9_-]{16,}`),
  token("conductor-token", String.raw`\bcond[a-z]?_[A-Za-z0-9_-]{20,}`),
  // GitHub App installation tokens are `ghs_<appId>_<jwt>` (~520 chars, with
  // `.`, `_`, and `-`). Match the whole token before the jwt rule so the
  // `ghs_<appId>_` prefix is not left behind.
  token(
    "github-token",
    String.raw`\b(?:gh[pousr]_[A-Za-z0-9._-]{30,}|github_pat_[A-Za-z0-9_]{22,})`,
  ),
  token("anthropic-key", String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}`),
  token(
    "openai-key",
    String.raw`\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}`,
  ),
  token("aws-access-key-id", String.raw`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`),
  token("slack-token", String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`),
  token("google-api-key", String.raw`\bAIza[0-9A-Za-z_-]{35}`),
  token("stripe-key", String.raw`\b[rs]k_live_[0-9A-Za-z]{20,}`),
  token("npm-token", String.raw`\bnpm_[A-Za-z0-9]{36}`),
  token(
    "jwt",
    String.raw`\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`,
  ),
  {
    name: "url-password",
    regex: new RegExp(
      String.raw`(?<prefix>\b[a-z][a-z0-9+.-]*://[^\s:/@"\\]+:)[^\s@/"\\]{3,}(?=@)`,
      "g",
    ),
    replacement: `$<prefix>${marker("password")}`,
  },
  {
    name: "secret-assignment",
    regex: new RegExp(
      String.raw`(?<prefix>\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|_AUTH)\b(?:\\?")?\s*[=:]\s*(?:\\?")?)${VALUE}{8,}`,
      "g",
    ),
    replacement: `$<prefix>${marker("secret")}`,
  },
];
