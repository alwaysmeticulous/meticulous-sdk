interface TsvComment {
  id: string;
  author?: string;
  isAgentAuthored: boolean;
  text: string;
}

interface TsvResolvableComment extends TsvComment {
  isResolved?: boolean;
}

interface TsvCommentThread extends TsvResolvableComment {
  replies: TsvComment[];
}

/** A column only a thread's root carries, repeated on each of its replies. */
interface ThreadColumn<Thread> {
  name: string;
  value: (thread: Thread) => string;
}

const COMMENT_COLUMNS = ["author", "isAgentAuthored", "text"];

/**
 * Prints review comments as a TSV table, one row each. `text` is JSON-quoted
 * to keep multiline/tabbed bodies on one row.
 */
export const printCommentsTsv = (
  comments: TsvResolvableComment[],
  { includeResolved }: { includeResolved: boolean },
): void => {
  console.log(
    ["id", ...COMMENT_COLUMNS, ...(includeResolved ? ["isResolved"] : [])].join(
      "\t",
    ),
  );
  for (const comment of comments) {
    console.log(
      [
        comment.id,
        ...commentCells(comment),
        ...(includeResolved ? [String(comment.isResolved ?? false)] : []),
      ].join("\t"),
    );
  }
};

/**
 * Prints review comment threads as a TSV table, each comment followed by its
 * replies. `replyToCommentId` is TSV-only, so a reply row can be linked back
 * to its parent; `text` is JSON-quoted as in {@link printCommentsTsv}.
 */
export const printCommentThreadsTsv = <Thread extends TsvCommentThread>(
  threads: Thread[],
  {
    includeResolved,
    threadColumns = [],
  }: { includeResolved: boolean; threadColumns?: ThreadColumn<Thread>[] },
): void => {
  console.log(
    [
      "id",
      "replyToCommentId",
      ...COMMENT_COLUMNS,
      ...threadColumns.map(({ name }) => name),
      ...(includeResolved ? ["isResolved"] : []),
    ].join("\t"),
  );
  for (const thread of threads) {
    const threadCells = [
      ...threadColumns.map(({ value }) => value(thread)),
      ...(includeResolved ? [String(thread.isResolved ?? false)] : []),
    ];
    printThreadRow(thread, null, threadCells);
    for (const reply of thread.replies) {
      printThreadRow(reply, thread.id, threadCells);
    }
  }
};

const printThreadRow = (
  comment: TsvComment,
  replyToCommentId: string | null,
  threadCells: string[],
): void => {
  console.log(
    [
      comment.id,
      replyToCommentId ?? "",
      ...commentCells(comment),
      ...threadCells,
    ].join("\t"),
  );
};

const commentCells = (comment: TsvComment): string[] => [
  comment.author ?? "",
  String(comment.isAgentAuthored),
  JSON.stringify(comment.text),
];
