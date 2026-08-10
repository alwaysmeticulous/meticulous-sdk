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
