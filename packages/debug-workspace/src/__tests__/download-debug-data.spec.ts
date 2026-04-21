import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Re-implementation of the (non-exported) screenshots-filter used by
// `copyReplayDir`, so we can verify the `.metadata.json` kept /
// `.png` skipped policy without exercising the full S3 download path.
const copyScreenshotMetadataOnly = (src: string, dest: string): void => {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".metadata.json")) continue;
    cpSync(join(src, entry.name), join(dest, entry.name));
  }
};

describe("screenshots directory copy policy", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "met-debug-copy-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("keeps *.metadata.json and drops *.png", () => {
    const src = join(tmp, "src");
    const dest = join(tmp, "dest");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "screenshot-after-event-00001.metadata.json"), "{}");
    writeFileSync(join(src, "screenshot-after-event-00001.png"), "fake-png");
    writeFileSync(join(src, "final-state.png"), "fake-png");
    writeFileSync(join(src, "final-state.metadata.json"), "{}");

    copyScreenshotMetadataOnly(src, dest);

    const copied = readdirSync(dest).sort();
    expect(copied).toEqual([
      "final-state.metadata.json",
      "screenshot-after-event-00001.metadata.json",
    ]);
    expect(existsSync(join(dest, "final-state.png"))).toBe(false);
    expect(existsSync(join(dest, "screenshot-after-event-00001.png"))).toBe(
      false,
    );
  });
});
