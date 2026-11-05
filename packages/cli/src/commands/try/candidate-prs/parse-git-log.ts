import type { FileChange, GitCommit } from "./types";

export const RECORD_SEPARATOR = "\x1e";
export const FIELD_SEPARATOR = "\x1f";
export const HEADER_END = "\x1d";

/**
 * `git log` pretty format matching {@link parseGitLog}. The header ends with
 * HEADER_END so a commit body can contain anything, numstat lines follow it.
 */
export const GIT_LOG_FORMAT =
  "%x1e" + ["%H", "%P", "%ct", "%an", "%s", "%b"].join("%x1f") + "%x1d";

export const parseGitLog = (raw: string): GitCommit[] =>
  raw
    .split(RECORD_SEPARATOR)
    .filter((record) => record.trim().length > 0)
    .map(parseRecord)
    .filter((commit): commit is GitCommit => commit !== null);

const parseRecord = (record: string): GitCommit | null => {
  const headerEnd = record.indexOf(HEADER_END);
  if (headerEnd === -1) {
    return null;
  }
  const fields = record.slice(0, headerEnd).split(FIELD_SEPARATOR);
  if (fields.length < 6) {
    return null;
  }
  const [sha, parents, committedAt, author, subject, ...bodyParts] = fields;
  return {
    sha: sha.trim(),
    parents: parents.trim().split(/\s+/).filter(Boolean),
    committedAt: Number(committedAt),
    author,
    subject,
    body: bodyParts.join(FIELD_SEPARATOR).trim(),
    files: parseNumstat(record.slice(headerEnd + 1)),
  };
};

const parseNumstat = (text: string): FileChange[] =>
  text
    .split("\n")
    .map((line) => line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, added, deleted, path]) => ({
      path: resolveRenamedPath(path),
      added: added === "-" ? 0 : Number(added),
      deleted: deleted === "-" ? 0 : Number(deleted),
    }));

/** `src/{old => new}/a.ts` and `old.ts => new.ts` both resolve to the new path. */
export const resolveRenamedPath = (path: string): string => {
  const braced = path.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braced) {
    const [, prefix, , renamed, suffix] = braced;
    return `${prefix}${renamed}${suffix}`.replace(/\/\//g, "/");
  }
  const plain = path.split(" => ");
  return plain[plain.length - 1];
};
