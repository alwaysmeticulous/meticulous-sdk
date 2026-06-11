import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { downloadAndExtractFile } from "@alwaysmeticulous/downloading-helpers";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { downloadAndAssembleSnapshots } from "../download-snapshots";

vi.mock("@alwaysmeticulous/downloading-helpers", () => ({
  downloadAndExtractFile: vi.fn(),
}));

const SIGNED_BASE_URL = "https://cf.example/?Signature=sig&Key-Pair-Id=k";

const keyFromUrl = (url: string): string => new URL(url).pathname.slice(1);

describe("downloadAndAssembleSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Emulate the real helper: extract the (zip-wrapped) file into `extractDir`
    // as a single `<type>.json` containing the stored snapshot array, with the
    // file's key echoed into `data` so the test can assert per-file wiring.
    (downloadAndExtractFile as Mock).mockImplementation(
      async (url: string, _zipPath: string, extractDir: string) => {
        const key = keyFromUrl(url);
        const fileName = key.split("/").pop()!.replace(/\.gz$/, "");
        await mkdir(extractDir, { recursive: true });
        await writeFile(
          join(extractDir, fileName),
          JSON.stringify([
            { stageDuringSession: "final-state", data: { fromKey: key } },
          ]),
        );
        return [fileName];
      },
    );
  });

  it("downloads each file from the signed base URL and tags entries with type + sessionId", async () => {
    const files = [
      {
        type: "network-requests",
        sessionId: "sess-a",
        key: "proj/replay-a/custom-checks-snapshots/network-requests.json.gz",
      },
      {
        type: "network-requests",
        sessionId: "sess-b",
        key: "proj/replay-b/custom-checks-snapshots/network-requests.json.gz",
      },
    ];

    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      files,
    });

    expect(snapshots).toEqual([
      {
        type: "network-requests",
        sessionId: "sess-a",
        stageDuringSession: "final-state",
        data: { fromKey: files[0].key },
        versionNumber: 0,
      },
      {
        type: "network-requests",
        sessionId: "sess-b",
        stageDuringSession: "final-state",
        data: { fromKey: files[1].key },
        versionNumber: 0,
      },
    ]);

    // Each file is fetched by setting the path on the signed base URL while
    // preserving the signature query string.
    const requestedUrls = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as string,
    );
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        `https://cf.example/${files[0].key}?Signature=sig&Key-Pair-Id=k`,
        `https://cf.example/${files[1].key}?Signature=sig&Key-Pair-Id=k`,
      ]),
    );
  });

  it("returns no snapshots and does not download when there are no files", async () => {
    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      files: [],
    });

    expect(snapshots).toEqual([]);
    expect(downloadAndExtractFile).not.toHaveBeenCalled();
  });

  it("throws if a downloaded file has no .json entry", async () => {
    (downloadAndExtractFile as Mock).mockResolvedValue([]);

    await expect(
      downloadAndAssembleSnapshots({
        signedBaseUrl: SIGNED_BASE_URL,
        files: [
          {
            type: "network-requests",
            sessionId: "sess-a",
            key: "proj/replay-a/custom-checks-snapshots/network-requests.json.gz",
          },
        ],
      }),
    ).rejects.toThrow(/did not contain a .json entry/);
  });
});
