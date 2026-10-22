import { describe, expect, it } from "vitest";
import { redactSecrets } from "../redact-secrets";

describe("redactSecrets", () => {
  it.each([
    ["ghp_" + "a".repeat(36), "[REDACTED:github-token]"],
    ["github_pat_" + "B".repeat(30), "[REDACTED:github-token]"],
    [
      "ghs_123456_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIiLCJpYXQiOjE3NzE3NjAwMDB9." +
        "A".repeat(40),
      "[REDACTED:github-token]",
    ],
    ["atit-" + "c".repeat(40), "[REDACTED:meticulous-ingest-token]"],
    ["prat-" + "c".repeat(40), "[REDACTED:meticulous-api-token]"],
    ["cond_" + "d".repeat(43), "[REDACTED:conductor-token]"],
    ["condw_" + "d".repeat(43), "[REDACTED:conductor-token]"],
    ["sk-ant-api03-" + "e".repeat(40), "[REDACTED:anthropic-key]"],
    ["sk-proj-" + "f".repeat(40), "[REDACTED:openai-key]"],
    ["AKIAIOSFODNN7EXAMPLE", "[REDACTED:aws-access-key-id]"],
    ["xoxb-1234567890-abcdef", "[REDACTED:slack-token]"],
    [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "[REDACTED:jwt]",
    ],
  ])("redacts %s", (secret, expected) => {
    expect(redactSecrets(`token is ${secret} ok`)).toBe(
      `token is ${expected} ok`,
    );
  });

  it("redacts secret-named assignments but keeps the name", () => {
    expect(redactSecrets("GITHUB_TOKEN=abc123def456 next")).toBe(
      "GITHUB_TOKEN=[REDACTED:secret] next",
    );
    expect(redactSecrets("DATABASE_PASSWORD: hunter2hunter2")).toBe(
      "DATABASE_PASSWORD: [REDACTED:secret]",
    );
  });

  it("redacts passwords in URLs", () => {
    expect(redactSecrets("postgres://app:s3cretpw@db:5432/x")).toBe(
      "postgres://app:[REDACTED:password]@db:5432/x",
    );
  });

  it("redacts private key blocks", () => {
    expect(
      redactSecrets(
        "-----BEGIN OPENSSH PRIVATE KEY-----\\nabc\\ndef\\n-----END OPENSSH PRIVATE KEY-----",
      ),
    ).toBe("[REDACTED:private-key]");
  });

  it("keeps JSON valid when secrets sit inside escaped JSON strings", () => {
    const transcript = JSON.stringify({
      message: {
        content: JSON.stringify({
          env: "API_TOKEN=abcdefgh1234\nPATH=/usr/bin",
          headers: { Authorization: "Bearer ghp_" + "z".repeat(36) },
          SERVICE_SECRET: "hunter2hunter2",
        }),
      },
    });
    const redacted = redactSecrets(transcript);

    const inner = JSON.parse(
      (JSON.parse(redacted) as { message: { content: string } }).message
        .content,
    ) as Record<string, unknown>;
    expect(inner).toEqual({
      env: "API_TOKEN=[REDACTED:secret]\nPATH=/usr/bin",
      headers: { Authorization: "Bearer [REDACTED:github-token]" },
      SERVICE_SECRET: "[REDACTED:secret]",
    });
  });

  it("leaves ordinary text alone", () => {
    const text =
      "Ran TOKEN_COUNT=12 and read docs/api_key_rotation.md, see sk-learn and https://example.com/a:b@c";
    expect(redactSecrets(text)).toBe(text);
  });
});
