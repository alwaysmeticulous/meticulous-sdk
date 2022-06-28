import { exec } from "child_process";
import { createHash, randomUUID } from "crypto";
import { WriteStream } from "fs";
import { FileHandle, open } from "fs/promises";
import { DateTime } from "luxon";
import { getMeticulousLocalDataDir } from "../local-data/local-data";
import { getLogFile } from "../local-data/logs";

const random = () => {
  return createHash("sha256").update(randomUUID()).digest("hex").slice(0, 8);
};

const getUname: () => Promise<string> = () => {
  return new Promise((resolve, reject) => {
    exec("uname -a", { encoding: "utf-8" }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
};

const getNpmConfig: () => Promise<string> = () => {
  return new Promise((resolve, reject) => {
    exec("npm config get", { encoding: "utf-8" }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
};

export class DebugLogger {
  constructor(
    private readonly invocationId: string,
    private readonly logFilePath: string,
    private readonly logFile: FileHandle,
    private readonly writeStream: WriteStream
  ) {}

  log(msg: string): void {
    this.writeStream.write(msg);
    this.writeStream.write("\n");
  }

  logObject(object: any): void {
    this.log(JSON.stringify(object, null, 2));
  }

  protected async logStart(): Promise<void> {
    console.log(`Recording detailed log file in ${this.logFilePath}`);

    const uname = await getUname().catch((error) => `Error: ${error}`);
    const cwd = process.cwd();
    const argv = process.argv;
    const execArgv = process.execArgv;
    const meticulousLocalDataDir = getMeticulousLocalDataDir();

    const invocation = {
      uname,
      cwd,
      argv,
      execArgv,
      meticulousLocalDataDir,
    };
    this.log("Invocation:");
    this.logObject(invocation);

    const npmConfig = await getNpmConfig().catch((error) => `Error: ${error}`);
    this.log("NPM config:");
    this.logObject({ npmConfig });
  }

  static async create(): Promise<DebugLogger> {
    const invocationId = DebugLogger.genereteInvocationId();
    const logFilePath = await getLogFile(invocationId);
    const logFile = await open(logFilePath, "ax");
    const writeStream = logFile.createWriteStream({
      encoding: "utf-8",
    });

    const logger = new DebugLogger(
      invocationId,
      logFilePath,
      logFile,
      writeStream
    );
    await logger.logStart();
    return logger;
  }

  protected static genereteInvocationId() {
    const date = DateTime.utc();
    return `${date.toISO()}_${random()}`;
  }
}
