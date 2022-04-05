import { PNG } from "pngjs";
import { readFile } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";

export const readPng: (path: string) => Promise<PNG> = async (path) => {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    createReadStream(path)
      .pipe(png)
      .on("parsed", () => {
        resolve(png);
      })
      .on("error", (error) => reject(error));
  });
};

export const writePng: (png: PNG, path: string) => Promise<void> = async (
  png,
  path
) => {
  return new Promise((resolve, reject) => {
    const str = createWriteStream(path);
    png.pack().pipe(str);
    str.on("close", () => resolve()).on("error", (error) => reject(error));
  });
};
