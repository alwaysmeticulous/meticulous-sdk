import { mkdir, rmdir, access } from "fs/promises";
import { join } from "path";
import { lock, LockOptions } from "proper-lockfile";

export const sanitizeFilename: (filename: string) => string = (filename) => {
  return filename.replace(/[^a-zA-Z0-9]/g, "_");
};

type ReleaseLock = () => Promise<void>;

// We create a lock file so that if multiple processes try downloading at the same
// time they don't interfere with each other. The second process to run will
// wait for the first process to complete, and then return straight away because
// it'll notice the file already exists.
export const waitToAcquireLockOnFile = async (
  filePath: string
): Promise<ReleaseLock> => {
  // In many cases the file doesn't exist yet, and can't exist yet
  // (need to download the data, and creating an empty file is risky if the process crashes)
  // However proper-lockfile requires as to pass a file or directory as the first arg. This path is just used
  // for it to resolve symlinks in the path correctly, and to detect if the same process tries taking
  // out multiple locks on the same path. It just needs to be calculated as something
  // that's unique to the file, and gives the same path for a given file everytime. So we create our
  // own lock-target directory for this purpose (directory not file since mkdir is guaranteed to be synchronous).
  const lockDirectory = `${filePath}.lock-target`;
  await mkdir(lockDirectory, { recursive: true });

  try {
    const releaseLock = await lock(lockDirectory, {
      retries: LOCK_RETRY_OPTIONS,
      lockfilePath: `${filePath}.lock`,
    });
    return async () => {
      // Clean up our directory _before_ releasing the lock
      // We check if it exists first, because if we're just coming out of
      // a lock released by someone else then they will have already deleted
      // the directory
      if (await fileExists(lockDirectory)) {
        await rmdir(lockDirectory);
      }
      await releaseLock();
    };
  } catch (err) {
    await rmdir(lockDirectory);
    throw err;
  }
};

export const fileExists = (filePath: string) =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

export const waitToAcquireLockOnDirectory = (
  directoryPath: string
): Promise<ReleaseLock> => {
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
