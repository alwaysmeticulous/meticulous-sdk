import { spawn } from "child_process";
import { resolve } from "path";

const PORT = 3005;

export interface Server {
  url: string;
  close: () => void;
}

export const startUIServer: () => Promise<Server> = async () => {
  const workDir = resolve(__dirname, "..");

  const child = spawn("serve", ["-s", "-p", `${PORT}`, "out"], {
    cwd: workDir,
  });

  const url = `http://localhost:${PORT}`;

  const startedLogPromise = new Promise<void>((resolve) => {
    child.stdout.on("data", (data) => {
      if (`${data}`.includes("Accepting connections")) {
        resolve();
        console.log(`UI Server started at ${url}`);
        child.stdout.removeAllListeners();
      }
    });
  });

  const spawnPromise = new Promise<void>((resolve) => {
    child.on("spawn", () => resolve());
  });

  await Promise.all([startedLogPromise, spawnPromise]);

  const close = () => {
    child.kill();
  };

  return {
    url,
    close,
  };
};
