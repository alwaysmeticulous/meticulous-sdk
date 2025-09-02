import fs from "fs";
import path from "path";

const WORKER_FILE_NAME = "tunnel-worker.entrypoint.js";
const MAX_SEARCH_DEPTH = 2;

export const findWorkerFile = (startDir: string): string => {
  const workerFileName = WORKER_FILE_NAME;

  for (let i = 0; i <= MAX_SEARCH_DEPTH; i++) {
    const searchDir =
      i === 0 ? startDir : path.resolve(startDir, "../".repeat(i));
    const workerPath = path.join(searchDir, workerFileName);

    if (fs.existsSync(workerPath)) {
      return workerPath;
    }
  }

  throw new Error(
    `Tunnel worker file ${workerFileName} not found in ${startDir}`,
  );
};
