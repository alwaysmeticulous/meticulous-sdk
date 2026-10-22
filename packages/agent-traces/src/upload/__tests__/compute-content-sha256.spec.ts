import type { AgentTraceRawFile } from "../../types/raw-envelope.types";
import { describe, expect, it } from "vitest";
import { computeContentSha256 } from "../compute-content-sha256";

const file = (relativePath: string, content: string): AgentTraceRawFile => ({
  relativePath,
  mtimeMs: 1,
  sizeBytes: Buffer.byteLength(content),
  content,
});

describe("computeContentSha256", () => {
  it("ignores mtimes", () => {
    const files = [file("a.jsonl", "{}\n")];
    const touched = files.map((f) => ({ ...f, mtimeMs: 2 }));

    expect(computeContentSha256(touched)).toBe(computeContentSha256(files));
  });

  it("changes when content or paths change", () => {
    const base = computeContentSha256([file("a.jsonl", "{}\n")]);

    expect(computeContentSha256([file("a.jsonl", "{}\n{}\n")])).not.toBe(base);
    expect(computeContentSha256([file("b.jsonl", "{}\n")])).not.toBe(base);
  });

  it("does not collide when bytes move between files", () => {
    expect(computeContentSha256([file("a", "xy"), file("b", "z")])).not.toBe(
      computeContentSha256([file("a", "x"), file("b", "yz")]),
    );
  });
});
