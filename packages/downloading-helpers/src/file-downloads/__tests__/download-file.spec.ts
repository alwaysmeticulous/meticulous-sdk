import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import http from "http";
import { downloadFile } from "../download-file";

describe("downloadFile", () => {
  it("downloads a file from a URL", async () => {
    const server = http.createServer((req, res) => {
      res.end("Hello World");
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1000,
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
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1,
        maxDownloadContentRetries: 0,
        downloadContentRetryDelay: 0,
      });

      throw new Error("Expected download to time out");
    } catch (e) {
      expect((e as Error).message).toEqual("Download timed out after 1ms");
    } finally {
      server.close();

      if (existsSync("file.txt")) {
        await rm("file.txt");
        // eslint-disable-next-line no-unsafe-finally
        throw new Error("Unexpected file download");
      }
    }
  });

  it("retries downloading content on file", async () => {
    let attempt = 0;
    const server = http.createServer((req, res) => {
      res.write("Hello");
      if (attempt === 1) {
        res.end(" World");
      }

      attempt++;
      setTimeout(() => {
        res.end("...  ... World.");
      }, 1000);
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 20,
        maxDownloadContentRetries: 1,
        downloadContentRetryDelay: 0,
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
});
