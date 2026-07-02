import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import {
  generateFilteredLogs,
  redactLogCredentials,
} from "../generate-debug-workspace";

describe("redactLogCredentials", () => {
  it("redacts plain HTTP-style Cookie and Authorization header lines", () => {
    const result = redactLogCredentials(
      [
        "Sending request to https://example.com",
        "Cookie: session_id=super-secret; other=1",
        "Authorization: Bearer abc123.def456.ghi789",
        "Content-Type: application/json",
      ].join("\n"),
    );

    expect(result).toContain("Cookie: <redacted>");
    expect(result).toContain("Authorization: <redacted>");
    expect(result).toContain("Content-Type: application/json");
    expect(result).not.toContain("super-secret");
    expect(result).not.toContain("abc123.def456.ghi789");
  });

  it("is case-insensitive and matches lowercase HTTP/2-style header names", () => {
    const result = redactLogCredentials("cookie: sessionId=xyz\n");
    expect(result).toBe("cookie: <redacted>\n");
  });

  it("redacts JSON-style { name, value } header/cookie dumps, including pretty-printed", () => {
    const compact = redactLogCredentials(
      '{"name":"Cookie","value":"foo=bar; sessionId=xyz"}',
    );
    expect(compact).toBe('{"name":"Cookie","value":"<redacted>"}');

    const pretty = redactLogCredentials(
      [
        "{",
        '  "name": "Authorization",',
        '  "value": "Bearer secret"',
        "}",
      ].join("\n"),
    );
    expect(pretty).toContain('"value": "<redacted>"');
    expect(pretty).not.toContain("Bearer secret");
  });

  it("redacts util.inspect-style single-quoted header/cookie object dumps", () => {
    const result = redactLogCredentials(
      "Setting header { name: 'Cookie', value: 'super-secret-cookie' }",
    );
    expect(result).toBe(
      "Setting header { name: 'Cookie', value: '<redacted>' }",
    );
  });

  it("redacts bare Bearer/Basic tokens wherever they appear", () => {
    const result = redactLogCredentials(
      "Retrying request with header value Bearer abc.def-ghi_123== and Basic dXNlcjpwYXNz",
    );
    expect(result).toBe(
      "Retrying request with header value Bearer <redacted> and Basic <redacted>",
    );
  });

  it("does not redact unrelated header names or plain text mentioning cookies", () => {
    const result = redactLogCredentials(
      [
        "Content-Length: 1234",
        "This log message mentions cookies in prose, not as a header.",
      ].join("\n"),
    );
    expect(result).toContain("Content-Length: 1234");
    expect(result).toContain(
      "This log message mentions cookies in prose, not as a header.",
    );
  });
});

describe("generateFilteredLogs credential redaction", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-redact-logs-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("redacts credential values in logs.deterministic.txt in place and propagates to the filtered copy", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "logs.deterministic.txt"),
      [
        "[virtual: 0ms] Sending request",
        "Cookie: session_id=super-secret",
        "[virtual: 10ms] Response received",
      ].join("\n"),
    );

    generateFilteredLogs(workspace);

    const rawAfter = readFileSync(
      join(replayDir, "logs.deterministic.txt"),
      "utf8",
    );
    expect(rawAfter).not.toContain("super-secret");
    expect(rawAfter).toContain("Cookie: <redacted>");

    const filteredAfter = readFileSync(
      join(replayDir, "logs.deterministic.filtered.txt"),
      "utf8",
    );
    expect(filteredAfter).not.toContain("super-secret");
    expect(filteredAfter).toContain("Cookie: <redacted>");
  });

  it("redacts credential values in logs.concise.txt in place", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "logs.concise.txt"),
      "Authorization: Bearer super-secret-token",
    );

    generateFilteredLogs(workspace);

    const rawAfter = readFileSync(join(replayDir, "logs.concise.txt"), "utf8");
    expect(rawAfter).not.toContain("super-secret-token");
    expect(rawAfter).toContain("Authorization: <redacted>");
  });

  it("redacts credential values in logs.ndjson message fields, preserving other entries", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    const entries = [
      {
        type: "console",
        source: "application",
        message: "Cookie: session_id=super-secret",
        realTime: 0,
      },
      { type: "virtual-time-change", virtualTime: 100 },
      {
        type: "console",
        source: "application",
        message: "Just a normal log line",
        realTime: 5,
      },
    ];
    writeFileSync(
      join(replayDir, "logs.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );

    generateFilteredLogs(workspace);

    const writtenLines = readFileSync(join(replayDir, "logs.ndjson"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
    expect(writtenLines[0].message).toBe("Cookie: <redacted>");
    expect(writtenLines[0].source).toBe("application");
    expect(writtenLines[1]).toEqual({
      type: "virtual-time-change",
      virtualTime: 100,
    });
    expect(writtenLines[2].message).toBe("Just a normal log line");
  });
});
