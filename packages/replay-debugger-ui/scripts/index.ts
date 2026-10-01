import type { AddressInfo } from "net";
import { join } from "path";
import express from "express";

// Our UI server will run on port 0, which means that the OS will assign a random port.
const PORT = 0;

export interface Server {
  url: string;
  close: () => void;
}

export const startUIServer = async ({
  // The static export shipped with this package; callers that repackage it
  // (e.g. the bundled CLI) pass its location.
  staticRoot = join(__dirname, "..", "out"),
}: { staticRoot?: string | undefined } = {}): Promise<Server> => {
  const app = express();

  app.use(express.static(staticRoot));

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(PORT, () => {
        const url = `http://localhost:${
          (server.address() as AddressInfo).port
        }`;
        console.log(`UI Server started at ${url}`);
        resolve({ url, close: () => server.close() });
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};
