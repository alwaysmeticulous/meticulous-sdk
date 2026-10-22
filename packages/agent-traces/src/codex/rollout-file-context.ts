import type { CodexEntryPosition } from "./codex-entry.types";
import type { RolloutLine } from "./parse-rollout-line";
import { parseSessionMetaLine } from "./parse-rollout-line";

export interface RolloutFileContext {
  /** Ordinals from here on were reverted away by a later file. */
  revertedFrom: number | null;
  /** Ordinals before this were inherited from the parent thread. */
  copiedBefore: number | null;
  sawSessionMeta: boolean;
}

export const toPosition = (
  line: RolloutLine,
  context: RolloutFileContext,
): CodexEntryPosition => ({
  timestamp: line.timestamp,
  copied:
    line.ordinal !== null &&
    context.copiedBefore !== null &&
    line.ordinal < context.copiedBefore,
  reverted:
    line.ordinal !== null &&
    context.revertedFrom !== null &&
    line.ordinal >= context.revertedFrom,
});

interface RolloutSource {
  rolloutId: string;
  text: string;
}

/**
 * The newest file is the live history. Its `history_base` chain (`files` are
 * oldest first) cuts each ancestor at that exclusive ordinal. A later revert
 * that continues an earlier file leaves the replacements in between off that
 * chain, so those files are reverted in full. Returns rollout id → cutoff.
 */
export const findRevertCutoffs = (
  files: readonly RolloutSource[],
): Map<string, number> => {
  const cutoffs = new Map<string, number>();
  const head = files[files.length - 1];
  if (!head) {
    return cutoffs;
  }
  const byRolloutId = new Map<string, RolloutSource>();
  for (const file of files) {
    byRolloutId.set(file.rolloutId, file);
  }
  const live = new Set<string>([head.rolloutId]);
  let current: RolloutSource | undefined = head;
  while (true) {
    const base = parseSessionMetaLine(firstLineOf(current.text))?.historyBase;
    if (!base || live.has(base.rolloutId)) {
      break;
    }
    const parent = byRolloutId.get(base.rolloutId);
    if (!parent) {
      break;
    }
    live.add(base.rolloutId);
    cutoffs.set(base.rolloutId, base.endOrdinalExclusive);
    current = parent;
  }
  for (const file of files) {
    if (!live.has(file.rolloutId)) {
      cutoffs.set(file.rolloutId, 0);
    }
  }
  return cutoffs;
};

const firstLineOf = (text: string): string => {
  const newline = text.indexOf("\n");
  return newline >= 0 ? text.slice(0, newline) : text;
};
