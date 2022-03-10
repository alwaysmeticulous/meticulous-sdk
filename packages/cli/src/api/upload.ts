import axios from "axios";
import { readFile } from "fs/promises";

export const uploadArchive: (
  uploadUrl: string,
  archivePath: string
) => Promise<void> = async (uploadUrl, archivePath) => {
  await axios.put(uploadUrl, await readFile(archivePath), {
    headers: {
      "Content-Type": "application/zip",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
};
