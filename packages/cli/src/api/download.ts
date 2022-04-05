import axios from "axios";
import { createWriteStream } from "fs";
import { finished } from "stream";
import { promisify } from "util";

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
