export const getSnippetVersionFolder = (version: string | null) => {
  if (version == null) {
    return "v1";
  }
  return `v/${version}`;
};
