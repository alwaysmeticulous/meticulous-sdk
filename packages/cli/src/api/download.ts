import { createWriteStream } from "fs";
import { finished } from "stream";
import { promisify } from "util";
import axios from "axios";

const promisifiedFinished = promisify(finished);

export const downloadFile: (
  fileUrl: string,
  path: string
) => Promise<void> = async (fileUrl, path) => {
  const writer = createWriteStream(path);
  return axios
    .request({ method: "GET", url: fileUrl, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });
};
