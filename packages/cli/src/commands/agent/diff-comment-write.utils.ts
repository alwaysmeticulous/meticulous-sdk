export const diffCommentCoordinateOptions = {
  x: {
    number: true,
    demandOption: true,
    description:
      "Required approximate normalized horizontal image coordinate from 0 to 1.",
  },
  y: {
    number: true,
    demandOption: true,
    description:
      "Required approximate normalized vertical image coordinate from 0 to 1.",
  },
} as const;

/**
 * {@link diffCommentCoordinateOptions} for a decision command, which takes
 * `--diffs` in their place, so yargs can't demand them.
 */
export const diffDecisionCoordinateOptions = {
  x: { ...diffCommentCoordinateOptions.x, demandOption: false },
  y: { ...diffCommentCoordinateOptions.y, demandOption: false },
} as const;
