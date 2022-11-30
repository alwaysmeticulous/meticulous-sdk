import { join } from "path";
import { lock, LockOptions } from "proper-lockfile";

export const sanitizeFilename: (filename: string) => string = (filename) => {
  return filename.replace(/[^a-zA-Z0-9]/g, "_");
};

type ReleaseLock = () => Promise<void>;

export const waitToAcquireLockOnFile = (
  filePath: string
): Promise<ReleaseLock> => {
  // Create a lock file so that if multiple processes try downloading at the same
  // time they don't interfere with each other. The second process to run will
  // wait for the first process to complete, and then return straight away because
  // it'll notice the file already exists.
  return lock(filePath, {
    retries: LOCK_RETRY_OPTIONS,
  });
};

export const waitToAcquireLockOnDirectory = (
  directoryPath: string
): Promise<ReleaseLock> => {
  // Create a lock file so that if multiple processes try downloading at the same
  // time they don't interfere with each other. The second process to run will
  // wait for the first process to complete, and then return straight away because
  // it'll notice the files required already exist.
  return lock(directoryPath, {
    retries: LOCK_RETRY_OPTIONS,
    lockfilePath: join(directoryPath, "dir.lock"),
  });
};

const ONE_SECOND_IN_MS = 1_000;

const LOCK_RETRY_OPTIONS: LockOptions["retries"] = {
  // We want to keep on retrying till we get the maxRetryTime, so we set retries, which is a maximum, to a high value
  retries: 1000,
  factor: 1.05,
  minTimeout: 500,
  maxTimeout: 2000,
  // Wait a maximum of 120s for the other process to finish downloading and/or extracting
  maxRetryTime: 120 * ONE_SECOND_IN_MS,
  // Randomize so processes are less likely to clash on their retries
  randomize: true,
};
