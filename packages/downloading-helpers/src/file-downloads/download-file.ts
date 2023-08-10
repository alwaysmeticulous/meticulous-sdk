import { createWriteStream } from "fs";
import { finished } from "stream";
import { promisify } from "util";
import axios from "axios";
import axiosRetry from "axios-retry";

const promisifiedFinished = promisify(finished);

export const downloadFile: (
  fileUrl: string,
  path: string
) => Promise<void> = async (fileUrl, path) => {
  // Using the same timeout as the standard client in meticulous-sdk/packages/client/src/client.ts
  const client = axios.create({timeout: 60_000});
  axiosRetry(client, { retries: 3, shouldResetTimeout: true });

  const writer = createWriteStream(path);

  return client
    .request({ method: "GET", url: fileUrl, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });
};
