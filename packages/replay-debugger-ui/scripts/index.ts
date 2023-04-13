import { join } from "path";
import express from "express";

const PORT = 3005;

export interface Server {
  url: string;
  close: () => void;
}

export const startUIServer = async (): Promise<Server> => {
  const app = express();

  const staticRoot = join(__dirname, "..", "out");

  app.use(express.static(staticRoot));

  const url = `http://localhost:${PORT}`;

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(PORT, () => {
        console.log(`UI Server started at ${url}`);
        resolve({ url, close: () => server.close() });
      });
    } catch (err) {
      reject(err);
    }
  });
};
