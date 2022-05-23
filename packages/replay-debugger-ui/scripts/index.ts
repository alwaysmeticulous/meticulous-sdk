import { spawn } from "child_process";
import { resolve } from "path";

const PORT = 3005;

export interface Server {
  close: () => void;
}

export const startServer: () => Promise<Server> = async () => {
  const workDir = resolve(__dirname, "..");

  const child = spawn("serve", ["-s", "-p", `${PORT}`, "out"], {
    cwd: workDir,
  });

  const startedLogPromise = new Promise<void>((resolve) => {
    child.stdout.on("data", (data) => {
      if (`${data}`.includes("Accepting connections")) {
        resolve();
        console.log("Server started");
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
    close,
  };
};
