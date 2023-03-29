import { readFile } from "fs/promises";

let version = "";

export const getMeticulousVersion: (
  packageJsonPath: string
) => Promise<string> = async (packageJsonPath) => {
  if (version) {
    return version;
  }

  const packageJson = JSON.parse(
    await readFile(packageJsonPath, { encoding: "utf-8" })
  );

  const versionStr = packageJson["version"] || "unknown";

  version = `sdk-v${versionStr}`;
  return version;
};
