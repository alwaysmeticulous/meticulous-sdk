import { availableParallelism, totalmem } from "os";

const MAX_SLOTS = 6;
const CORES_PER_SLOT = 4;
const GIB_PER_SLOT = 4;

/** Roughly one concurrent install or build per 4 cores and 4 GiB of RAM. */
export const defaultBuildSlots = (): number => {
  const byCores = Math.floor(availableParallelism() / CORES_PER_SLOT);
  const byMemory = Math.floor(totalmem() / 1024 ** 3 / GIB_PER_SLOT);
  return Math.max(1, Math.min(MAX_SLOTS, byCores, byMemory));
};
