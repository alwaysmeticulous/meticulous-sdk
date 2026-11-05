import { readFileSync } from "fs";
import { availableParallelism, cpus } from "os";

const COMPRESSION_CONCURRENCY_ENV_VAR = "METICULOUS_COMPRESSION_CONCURRENCY";

/**
 * Each compression thread has its own V8 heap, and gains taper off as the
 * main thread (which reads and tars the files) becomes the bottleneck.
 */
const MAX_COMPRESSION_THREADS = 16;

/**
 * One compression thread per usable core, leaving one core for the main
 * thread, which walks the directory, builds the tar and drives the uploads.
 * `METICULOUS_COMPRESSION_CONCURRENCY` overrides this.
 */
export const getCompressionConcurrency = (
  env: NodeJS.ProcessEnv = process.env,
  readCgroupFile: (path: string) => string | null = readFileOrNull,
): number => {
  const fromEnv = Number.parseInt(
    env[COMPRESSION_CONCURRENCY_ENV_VAR] ?? "",
    10,
  );
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(fromEnv, MAX_COMPRESSION_THREADS);
  }
  const cores = Math.min(
    typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length,
    getCgroupCpuLimit(readCgroupFile) ?? Infinity,
  );
  return Math.min(MAX_COMPRESSION_THREADS, Math.max(2, cores - 1));
};

/**
 * Before Node 22, `availableParallelism()` reports the host's cores even when
 * a container's CPU quota allows far fewer, so read the quota directly.
 */
const getCgroupCpuLimit = (
  readCgroupFile: (path: string) => string | null,
): number | null => {
  const v2 = readCgroupFile("/sys/fs/cgroup/cpu.max")?.trim().split(/\s+/);
  if (v2 != null && v2[0] !== "max") {
    return toCoreCount(Number(v2[0]), Number(v2[1]));
  }
  const v1Quota = readCgroupFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us");
  const v1Period = readCgroupFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us");
  if (v1Quota != null && v1Period != null) {
    return toCoreCount(Number(v1Quota), Number(v1Period));
  }
  return null;
};

const toCoreCount = (quota: number, period: number): number | null =>
  quota > 0 && period > 0 ? Math.max(1, Math.ceil(quota / period)) : null;

const readFileOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};
