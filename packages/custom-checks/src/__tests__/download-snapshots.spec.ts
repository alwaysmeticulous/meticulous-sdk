import { downloadAndUnzipJson } from "@alwaysmeticulous/downloading-helpers";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { downloadAndAssembleSnapshots } from "../download-snapshots";

vi.mock("@alwaysmeticulous/downloading-helpers", () => ({
  downloadAndUnzipJson: vi.fn(),
}));

const SIGNED_BASE_URL = "https://cf.example/?Signature=sig&Key-Pair-Id=k";

const keyFromUrl = (url: string): string => new URL(url).pathname.slice(1);

describe("downloadAndAssembleSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Emulate the real helper: return the stored snapshot array, with the
    // file's key echoed into `data` so the test can assert per-file wiring.
    (downloadAndUnzipJson as Mock).mockImplementation((url: string) =>
      Promise.resolve([
        {
          stageDuringSession: "final-state",
          data: { fromKey: keyFromUrl(url) },
        },
      ]),
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
      side: "base",
      files,
    });

    expect(snapshots).toEqual([
      {
        type: "network-requests",
        sessionId: "sess-a",
        sessionDescription: null,
        stageDuringSession: "final-state",
        data: { fromKey: files[0].key },
        versionNumber: 0,
      },
      {
        type: "network-requests",
        sessionId: "sess-b",
        sessionDescription: null,
        stageDuringSession: "final-state",
        data: { fromKey: files[1].key },
        versionNumber: 0,
      },
    ]);

    // Each file is fetched by setting the path on the signed base URL while
    // preserving the signature query string.
    const requestedUrls = (downloadAndUnzipJson as Mock).mock.calls.map(
      (call) => call[0] as string,
    );
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        `https://cf.example/${files[0].key}?Signature=sig&Key-Pair-Id=k`,
        `https://cf.example/${files[1].key}?Signature=sig&Key-Pair-Id=k`,
      ]),
    );
  });

  it("preserves a stored sessionDescription on each entry", async () => {
    (downloadAndUnzipJson as Mock).mockImplementation((url: string) =>
      Promise.resolve([
        {
          stageDuringSession: "final-state",
          data: { fromKey: keyFromUrl(url) },
          sessionDescription: "Added an item to the cart",
        },
      ]),
    );

    const key =
      "proj/replay-a/custom-checks-snapshots/network-requests.json.gz";
    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      side: "base",
      files: [{ type: "network-requests", sessionId: "sess-a", key }],
    });

    expect(snapshots).toEqual([
      {
        type: "network-requests",
        sessionId: "sess-a",
        sessionDescription: "Added an item to the cart",
        stageDuringSession: "final-state",
        data: { fromKey: key },
        versionNumber: 0,
      },
    ]);
  });

  it("returns no snapshots and does not download when there are no files", async () => {
    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      side: "base",
      files: [],
    });

    expect(snapshots).toEqual([]);
    expect(downloadAndUnzipJson).not.toHaveBeenCalled();
  });

  it("applies projectSnapshotData to each parsed entry when provided", async () => {
    (downloadAndUnzipJson as Mock).mockResolvedValue([
      {
        stageDuringSession: "screenshot-after-event-00001",
        data: {
          url: "https://app.example.com/api/items",
          method: "GET",
          requestHeaders: [{ name: "cookie", value: "secret" }],
          responseHeaders: [
            { name: "content-type", value: "application/json" },
          ],
        },
      },
    ]);

    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      side: "base",
      files: [
        {
          type: "network-requests",
          sessionId: "sess-a",
          key: "proj/replay-a/custom-checks-snapshots/network-requests.json.gz",
        },
      ],
      projectSnapshotData: ({
        type,
        sessionId,
        stageDuringSession,
        data,
        side,
      }) => ({
        projectedFrom: [side, type, sessionId, stageDuringSession].join(":"),
        url: (data as { url?: string }).url,
      }),
    });

    expect(snapshots).toEqual([
      {
        type: "network-requests",
        sessionId: "sess-a",
        sessionDescription: null,
        stageDuringSession: "screenshot-after-event-00001",
        data: {
          projectedFrom:
            "base:network-requests:sess-a:screenshot-after-event-00001",
          url: "https://app.example.com/api/items",
        },
        versionNumber: 0,
      },
    ]);
  });

  it("deduplicates equal strings across entries and files through the given pool", async () => {
    // Fresh copies per file, as JSON.parse produces.
    (downloadAndUnzipJson as Mock).mockImplementation(() =>
      Promise.resolve(
        JSON.parse(
          JSON.stringify([
            {
              stageDuringSession: "final-state",
              sessionDescription: "Opened settings",
              data: { nodes: [{ html: "<img>" }, { html: "<img>" }] },
            },
          ]),
        ),
      ),
    );
    const stringPool = new Map<string, string>();

    const snapshots = await downloadAndAssembleSnapshots({
      signedBaseUrl: SIGNED_BASE_URL,
      side: "head",
      stringPool,
      files: [
        { type: "axe-accessibility", sessionId: "sess-a", key: "a.json.gz" },
        { type: "axe-accessibility", sessionId: "sess-b", key: "b.json.gz" },
      ],
    });

    expect(snapshots.map((snapshot) => snapshot.data)).toEqual([
      { nodes: [{ html: "<img>" }, { html: "<img>" }] },
      { nodes: [{ html: "<img>" }, { html: "<img>" }] },
    ]);
    expect([...stringPool.keys()].sort()).toEqual(
      ["<img>", "Opened settings", "final-state"].sort(),
    );
  });

  it("throws if a downloaded file does not contain a JSON array", async () => {
    (downloadAndUnzipJson as Mock).mockResolvedValue({ notAnArray: true });

    await expect(
      downloadAndAssembleSnapshots({
        signedBaseUrl: SIGNED_BASE_URL,
        side: "base",
        files: [
          {
            type: "network-requests",
            sessionId: "sess-a",
            key: "proj/replay-a/custom-checks-snapshots/network-requests.json.gz",
          },
        ],
      }),
    ).rejects.toThrow(/to contain a JSON array/);
  });
});
