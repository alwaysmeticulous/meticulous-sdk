import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  unzipSingleEntry,
  unzipSingleEntryToJson,
  unzipSingleEntryToString,
} from "../unzip-single-entry";

const makeZip = async (populate: (zip: JSZip) => void): Promise<Uint8Array> => {
  const zip = new JSZip();
  populate(zip);
  return zip.generateAsync({ type: "uint8array", platform: "UNIX" });
};

const SYMLINK_MODE = 0o120777;

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

/**
 * Rewrites an entry's central directory record to the DOS representation of a
 * directory: no trailing slash on the name, the 0x10 attribute set, and a
 * `versionMadeBy` that says MS-DOS rather than Unix. Both jszip and archiver
 * write the trailing slash instead, so a Windows-produced archive can only be
 * forged. yauzl lists entries from the central directory, so that is the only
 * copy that has to be patched.
 */
const markAsDosDirectoryEntry = (
  bytes: Uint8Array,
  fileName: string,
): Uint8Array => {
  const buffer = Buffer.from(bytes);
  for (let offset = 0; offset <= buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString(
      "utf-8",
      offset + 46,
      offset + 46 + nameLength,
    );
    if (name !== fileName) {
      continue;
    }
    buffer.writeUInt16LE(0, offset + 4);
    buffer.writeUInt32LE(0x10, offset + 38);
    return buffer;
  }
  throw new Error(`No central directory record named ${fileName}`);
};

describe("unzipSingleEntry", () => {
  it("returns the single entry's bytes", async () => {
    const bytes = await makeZip((zip) => zip.file("payload.bin", "contents"));

    expect(
      (await unzipSingleEntry(bytes, "payload.bin")).toString("utf-8"),
    ).toBe("contents");
  });

  it("reads an entry larger than one stream chunk", async () => {
    // Exercises the chunk concatenation: the default highWaterMark is 64KB.
    const large = "x".repeat(500_000);
    const bytes = await makeZip((zip) => zip.file("big.txt", large));

    expect(await unzipSingleEntryToString(bytes, "big.txt")).toBe(large);
  });

  it("ignores directory entries alongside the file", async () => {
    const bytes = await makeZip((zip) => {
      zip.folder("nested");
      zip.file("nested/data.json", '{"ok":true}');
    });

    expect(await unzipSingleEntryToJson(bytes, "data.json")).toEqual({
      ok: true,
    });
  });

  it("ignores a Windows-style directory entry carrying only the DOS attribute", async () => {
    const bytes = markAsDosDirectoryEntry(
      await makeZip((zip) => {
        zip.file("nested", "");
        zip.file("data.json", '{"ok":true}');
      }),
      "nested",
    );

    expect(await unzipSingleEntryToJson(bytes, "data.json")).toEqual({
      ok: true,
    });
  });

  it("ignores __MACOSX metadata alongside the file", async () => {
    const bytes = await makeZip((zip) => {
      zip.file("__MACOSX/._data.json", "resource fork");
      zip.folder("__MACOSX");
      zip.file("data.json", '{"ok":true}');
    });

    expect(await unzipSingleEntryToJson(bytes, "data.json")).toEqual({
      ok: true,
    });
  });

  it("ignores symlink entries alongside the file", async () => {
    const bytes = await makeZip((zip) => {
      zip.file("link", "data.json", { unixPermissions: SYMLINK_MODE });
      zip.file("data.json", '{"ok":true}');
    });

    expect(await unzipSingleEntryToJson(bytes, "data.json")).toEqual({
      ok: true,
    });
  });

  it("throws on an archive holding nothing but ignored entries", async () => {
    const bytes = await makeZip((zip) => {
      zip.folder("nested");
      zip.file("__MACOSX/._data.json", "resource fork");
    });

    await expect(unzipSingleEntry(bytes, "junk.zip")).rejects.toThrow(
      /junk\.zip appears to be empty/,
    );
  });

  it("throws on an empty archive", async () => {
    const bytes = await makeZip(() => undefined);

    await expect(unzipSingleEntry(bytes, "empty.zip")).rejects.toThrow(
      /empty\.zip appears to be empty/,
    );
  });

  it("throws on a multi-entry archive, naming the entries", async () => {
    const bytes = await makeZip((zip) => {
      zip.file("a.json", "{}");
      zip.file("b.json", "{}");
    });

    await expect(unzipSingleEntry(bytes, "two.zip")).rejects.toThrow(
      /contains 2 entries; expected exactly 1\. Entries: a\.json, b\.json/,
    );
  });

  it("throws on data that is not a zip at all", async () => {
    await expect(
      unzipSingleEntry(new TextEncoder().encode("not a zip"), "bogus.zip"),
    ).rejects.toThrow();
  });

  it("reads a view into a larger buffer without picking up its neighbours", async () => {
    const bytes = await makeZip((zip) => zip.file("a.txt", "payload"));
    const padded = new Uint8Array(bytes.byteLength + 64);
    padded.set(bytes, 32);
    const view = padded.subarray(32, 32 + bytes.byteLength);

    expect(await unzipSingleEntryToString(view, "a.txt")).toBe("payload");
  });
});
