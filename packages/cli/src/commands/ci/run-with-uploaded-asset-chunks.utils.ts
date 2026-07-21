import type {
  ProjectAssetChunkVersionLookup,
  RequestedProjectAssetChunkReference,
} from "@alwaysmeticulous/client";

const SUPPORTED_VERSION_LOOKUPS: readonly ProjectAssetChunkVersionLookup[] = [
  "latest-in-history",
];

const MANIFEST_ENTRY_SHAPES_MESSAGE =
  `--assetReferencesManifest entries must each be exactly one of:\n` +
  `  { "name": string, "versionId": string } (non-empty values), or\n` +
  `  { "name": string, "versionLookup": "latest-in-history" } (resolves the version from the base test run's history).`;

const isValidManifestEntry = (
  item: unknown,
): item is RequestedProjectAssetChunkReference => {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return false;
  }
  const name = (item as { name?: unknown }).name;
  const versionId = (item as { versionId?: unknown }).versionId;
  const versionLookup = (item as { versionLookup?: unknown }).versionLookup;

  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const hasVersionId = versionId !== undefined;
  const hasVersionLookup = versionLookup !== undefined;
  if (hasVersionId === hasVersionLookup) {
    return false;
  }

  if (hasVersionId) {
    return typeof versionId === "string" && versionId.length > 0;
  }
  return (
    typeof versionLookup === "string" &&
    (SUPPORTED_VERSION_LOOKUPS as readonly string[]).includes(versionLookup)
  );
};

export const validateAssetReferencesManifest = (
  parsed: unknown,
):
  | { manifest: RequestedProjectAssetChunkReference[] }
  | { errorMessage: string } => {
  if (!Array.isArray(parsed)) {
    return {
      errorMessage: `--assetReferencesManifest must be a JSON array of chunk references.\n${MANIFEST_ENTRY_SHAPES_MESSAGE}`,
    };
  }

  if (parsed.length === 0) {
    return { errorMessage: `--assetReferencesManifest must not be empty.` };
  }

  if (!parsed.every(isValidManifestEntry)) {
    return { errorMessage: MANIFEST_ENTRY_SHAPES_MESSAGE };
  }

  const names = parsed.map((entry) => entry.name);
  if (new Set(names).size !== names.length) {
    return {
      errorMessage: `--assetReferencesManifest must not contain duplicate chunk names: the manifest is a last-wins precedence list, so a repeated name silently discards the earlier entry.`,
    };
  }

  return { manifest: parsed };
};

export const manifestHasVersionLookupEntries = (
  manifest: RequestedProjectAssetChunkReference[],
): boolean => manifest.some((entry) => "versionLookup" in entry);
