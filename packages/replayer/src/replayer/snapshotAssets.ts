import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { get as getHttp, IncomingMessage } from "http";
import { get as getHttps } from "https";
import { join, dirname } from "path";

export const snapshotAssets = async (opts: {
  tempDir: string;
  baseUrl: string;
  assetUrls: string[];
}) => {
  const assetsPath = join(opts.tempDir, "snapshotted-assets");
  mkdir(assetsPath, {
    recursive: true,
  });
  return Promise.all(
    opts.assetUrls.map((url) => {
      const trimmedUrl = url.replace(opts.baseUrl, ""); // TODO: Just replace start
      downloadFile(url, join(assetsPath, getFilePath(trimmedUrl)));
      console.log("URL", url);
    })
  );
};

function getFilePath(trimmedUrl: string) {
  if (trimmedUrl === "" || trimmedUrl.endsWith("/")) {
    return join(trimmedUrl, "index.html");
  }
  return trimmedUrl;
}

// TODO: Use lib to download files
async function downloadFile(url: string, targetFile: string) {
  await mkdir(dirname(targetFile), { recursive: true });
  return await new Promise((resolve, reject) => {
    const useHttps = new URL(url).protocol === "https:";
    const successCallback = (response: IncomingMessage) => {
      const code = response.statusCode ?? 0;

      if (code >= 400) {
        return reject(new Error(response.statusMessage));
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return downloadFile(response.headers.location, targetFile);
      }

      // save the file to disk
      const fileWriter = createWriteStream(targetFile).on("finish", () => {
        resolve({});
      });

      response.pipe(fileWriter);
    };
    const errorCallback = (error: unknown) => {
      reject(error);
    };

    if (useHttps) {
      getHttps(url, successCallback).on("error", errorCallback);
    } else {
      getHttp(url, successCallback).on("error", errorCallback);
    }
  });
}
