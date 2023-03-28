import { readFile } from "fs/promises";
import axios from "axios";

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
