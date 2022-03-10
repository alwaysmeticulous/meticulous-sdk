import { readFile } from "fs/promises";
import { join, normalize } from "path";

let version: string = "";

export const getMeticulousVersion: () => Promise<string> = async () => {
  if (version) {
    return version;
  }

  const packageJsonPath = normalize(join(__dirname, "../../package.json"));
  const packageJson = JSON.parse(
    await readFile(packageJsonPath, { encoding: "utf-8" })
  );

  const versionStr = packageJson["version"] || "unknown";

  version = `sdk-v${versionStr}`;
  return version;
};
