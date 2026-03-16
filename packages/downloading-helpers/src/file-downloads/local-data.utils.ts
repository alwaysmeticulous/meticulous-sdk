import { access, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { initLogger } from "@alwaysmeticulous/common";
import { Duration } from "luxon";
import { lock, LockOptions } from "proper-lockfile";

/**
 * proper-lockfile v4 uses a timer that periodically stat()s the lock file to
 * keep it fresh. There's a race where the timer dispatches an async stat() just
 * before releaseLock() calls clearTimeout + removes the lock file. The
 * in-flight stat() then returns ENOENT, and proper-lockfile's default
 * onCompromised handler throws — from a timer callback, so it becomes an
 * uncaught exception that crashes the process.
 *
 * The lock IS released correctly; the error is purely internal to the library's
 * timer cleanup. We use onCompromised + a releasing flag to swallow this
 * specific case while still propagating genuine lock compromises.
 */
const acquireLockSafely = async (
  target: string,
  options: LockOptions,
): Promise<() => Promise<void>> => {
  let releasing = false;

  const releaseLock = await lock(target, {
    ...options,
    onCompromised: (err: Error) => {
      if (releasing && isLockReleaseRaceConditionError(err)) {
        const logger = initLogger();
        logger.warn(
          "Ignoring benign ENOENT error during lock release (proper-lockfile timer race condition)",
        );
        return;
      }
      throw err;
    },
  });

  return async () => {
    releasing = true;
    await releaseLock();
  };
};

const isLockReleaseRaceConditionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const nodeError = error as NodeJS.ErrnoException;
  // proper-lockfile mutates the original ENOENT error via Object.assign,
  // overwriting .code to ECOMPROMISED before calling onCompromised.
  return nodeError.code === "ECOMPROMISED" && error.message.includes("ENOENT");
};

export const sanitizeFilename: (filename: string) => string = (filename) => {
  return filename.replace(/[^a-zA-Z0-9]/g, "_");
};

type ReleaseLock = () => Promise<void>;

export interface LoadOrDownloadJsonFileOptions<T> {
  filePath: string;
  downloadJson: () => Promise<T | null>;

  /**
   * For debug messages e.g. 'session' or 'session data'
   */
  dataDescription: string;
}

/**
 * Returns the JSON.parse'd contents of the file at the given path. If the file
 * doesn't exist yet then it downloads the object, writes it to the file, and returns it.
 *
 * Handles concurrent processes trying to download to the same file at the same time.
 */
export const getOrDownloadJsonFile = async <T>({
  filePath,
  downloadJson,
  dataDescription,
}: LoadOrDownloadJsonFileOptions<T>): Promise<T | null> => {
  const logger = initLogger();

  await mkdir(dirname(filePath), { recursive: true });

  // We create a lock file so that if multiple processes try downloading at the same
  // time they don't interfere with each other. The second process to run will
  // wait for the first process to complete, and then return straight away because
  // it'll notice the file already exists.
  const releaseLock = await waitToAcquireLockOnFile(filePath);

  try {
    const existingData = await readFile(filePath)
      .then((data) => JSON.parse(data.toString("utf-8")))
      .catch(() => null);
    if (existingData) {
      logger.debug(`Reading ${dataDescription} from local copy in ${filePath}`);
      return existingData;
    }

    const downloadedData = await downloadJson();
    if (downloadedData) {
      await writeFile(filePath, JSON.stringify(downloadedData, null, 2));
      logger.debug(`Wrote ${dataDescription} to ${filePath}`);
    }
    return downloadedData;
  } finally {
    await releaseLock();
  }
};

export const waitToAcquireLockOnFile = async (
  filePath: string,
): Promise<ReleaseLock> => {
  // In many cases the file doesn't exist yet, and can't exist yet (need to download the data, and creating an
  // empty file beforehand is risky if the process crashes, and a second process tries reading the empty file).
  // However proper-lockfile requires us to pass a file or directory as the first arg. This path is just used
  // to detect if the same process tries taking out multiple locks on the same file. It just needs to be calculated
  // as something that's unique to the file, and gives the same path for a given file everytime. So we create our
  // own lock-target directory for this purpose (directory not file since mkdir is guaranteed to be synchronous).
  // The path needs to actually exist, since proper-lockfile resolves symlinks on it.
  //
  // Note: we don't delete the lock directory afterwards because doing so without creating race-conditions is tricky
  const lockDirectory = `${filePath}.lock-target`;
  await mkdir(lockDirectory, { recursive: true });

  return acquireLockSafely(lockDirectory, {
    retries: LOCK_RETRY_OPTIONS,
    lockfilePath: `${filePath}.lock`,
  });
};

export const fileExists = (filePath: string) =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

export const waitToAcquireLockOnDirectory = (
  directoryPath: string,
): Promise<ReleaseLock> => {
  return acquireLockSafely(directoryPath, {
    retries: LOCK_RETRY_OPTIONS,
    lockfilePath: join(directoryPath, "dir.lock"),
  });
};

const LOCK_RETRY_OPTIONS: LockOptions["retries"] = {
  // We want to keep on retrying till we get the maxRetryTime, so we set retries, which is a maximum, to a high value
  retries: 1000,
  factor: 1.05,
  minTimeout: 500,
  maxTimeout: 2000,
  // Wait a maximum of 120s for the other process to finish downloading and/or extracting
  maxRetryTime: Duration.fromObject({ minutes: 2 }).as("milliseconds"),
  // Randomize so processes are less likely to clash on their retries
  randomize: true,
};
