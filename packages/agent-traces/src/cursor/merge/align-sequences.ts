/** Beyond this the table gets too big, so alignment falls back to a greedy pass. */
const MAX_TABLE_CELLS = 4_000_000;
const GREEDY_LOOKAHEAD = 200;

/** A pairing's score; 0 means the two items can't be paired. Must be an integer. */
export type PairWeight<A, B> = (a: A, b: B) => number;

/**
 * Pairs items of `a` with items of `b` in order, maximising the total weight
 * of the pairs (a weighted longest common subsequence). Among equally good
 * alignments it pairs the latest items: hook events usually begin partway
 * through a transcript (the hooks were installed mid-session), whereas a
 * transcript that lags behind its events catches up by the next upload.
 * Returns ascending `[indexInA, indexInB]` pairs.
 */
export const alignSequences = <A, B>(
  a: readonly A[],
  b: readonly B[],
  weight: PairWeight<A, B>,
): Array<[number, number]> => {
  if (a.length === 0 || b.length === 0) {
    return [];
  }
  if ((a.length + 1) * (b.length + 1) > MAX_TABLE_CELLS) {
    return alignGreedily(a, b, weight);
  }
  const width = b.length + 1;
  const scores = new Int32Array((a.length + 1) * width);
  const at = (i: number, j: number) => scores[i * width + j] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const pairWeight = weight(a[i - 1], b[j - 1]);
      const skip = Math.max(at(i - 1, j), at(i, j - 1));
      scores[i * width + j] =
        pairWeight > 0 ? Math.max(skip, at(i - 1, j - 1) + pairWeight) : skip;
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    const pairWeight = weight(a[i - 1], b[j - 1]);
    if (pairWeight > 0 && at(i, j) === at(i - 1, j - 1) + pairWeight) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (at(i, j) === at(i - 1, j)) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
};

const alignGreedily = <A, B>(
  a: readonly A[],
  b: readonly B[],
  weight: PairWeight<A, B>,
): Array<[number, number]> => {
  const pairs: Array<[number, number]> = [];
  let next = 0;
  a.forEach((item, i) => {
    const end = Math.min(b.length, next + GREEDY_LOOKAHEAD);
    for (let j = next; j < end; j++) {
      if (weight(item, b[j]) > 0) {
        pairs.push([i, j]);
        next = j + 1;
        return;
      }
    }
  });
  return pairs;
};
