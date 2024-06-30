import http from "http";
import { downloadFile } from "../download-file";
import { readFile, rm } from "fs/promises";
import { existsSync } from "fs";

describe("downloadFile", () => {
  it("downloads a file from a URL", async () => {
    const server = http.createServer((req, res) => {
      res.end("Hello World");
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        downloadTimeoutInMs: 1000,
      });

      // Read file contents
      const fileContents = await readFile("file.txt", "utf8");
      expect(fileContents).toBe("Hello World");
    } finally {
      server.close();
      if (existsSync("file.txt")) {
        await rm("file.txt");
      }
    }
  });

  it("times out on a too slow file download", async () => {
    const server = http.createServer((req, res) => {
      res.write("Helloooooo");
      setTimeout(() => {
        res.end("...  ... World.");
      }, 1000);
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        downloadTimeoutInMs: 1,
      });

      throw new Error("Expected download to time out");
    } catch (e) {
      expect((e as Error).message).toEqual("Download timed out after 1ms");
    } finally {
      server.close();

      if (existsSync("file.txt")) {
        await rm("file.txt");
        throw new Error("Unexpected file download");
      }
    }
  });
});
