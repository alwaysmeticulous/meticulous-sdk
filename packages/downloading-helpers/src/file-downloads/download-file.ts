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
  const client = axios.create();
  axiosRetry(client, { retries: 3 });

  const writer = createWriteStream(path);

  return client
    .request({ method: "GET", url: fileUrl, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });
};
