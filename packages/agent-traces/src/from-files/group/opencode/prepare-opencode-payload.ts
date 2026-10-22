import { readFile } from "fs/promises";
import { convertOpenCodeSession } from "../../../opencode/convert/convert-opencode-session";
import { formatOpenCodeExport } from "../../../opencode/format-opencode-export";
import type {
  OpenCodeExport,
  OpenCodeExportSession,
  OpenCodeMalformedRow,
} from "../../../opencode/opencode-export.types";
import { readGitBranch } from "../../../identity/read-git-branch";
import type { SessionPayload } from "../../../upload/session-payload.types";
import type { JsonRecord } from "../../../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asRecord,
} from "../../../utils/json-guards";
import type { OpenCodeFile } from "./group-opencode-sessions";

/**
 * Merges a root session's export with its descendants' into one export, the
 * shape the uploader synthesises from OpenCode's database. Exports the
 * uploader wrote already carry `childSessions`, which are kept.
 */
export const prepareOpenCodePayload = async (
  sessionId: string,
  [root, ...descendants]: OpenCodeFile[],
  converterVersion: string,
): Promise<SessionPayload> => {
  if (!root) {
    throw new Error(`OpenCode session ${sessionId} has no export`);
  }
  const [rootExport, ...descendantExports] = await Promise.all(
    [root, ...descendants].map(readExport),
  );
  const childSessions = withoutDuplicates(sessionId, [
    ...rootExport.childSessions,
    ...descendantExports.flatMap(
      ({ info, messages, childSessions: nested }) => [
        { info, messages },
        ...nested,
      ],
    ),
  ]);
  const merged: OpenCodeExport = {
    info: rootExport.info,
    messages: rootExport.messages,
    childSessions,
    malformedRows: [rootExport, ...descendantExports].flatMap(
      (exported) => exported.malformedRows,
    ),
  };
  const content = formatOpenCodeExport(merged);
  const { trajectory, stats } = convertOpenCodeSession(merged, {
    gitBranch: readGitBranch(asNonEmptyString(merged.info["directory"])),
    converterVersion,
  });
  return {
    envelope: {
      envelopeVersion: 1,
      agent: "opencode",
      sessionId,
      projectDirName: null,
      files: [
        {
          relativePath: `export/${sessionId}.json`,
          mtimeMs: Math.max(root.mtimeMs, ...descendants.map((f) => f.mtimeMs)),
          sizeBytes: Buffer.byteLength(content),
          content,
        },
      ],
    },
    trajectory,
    stats,
  };
};

const readExport = async (file: OpenCodeFile): Promise<OpenCodeExport> => {
  const record = asRecord(JSON.parse(await readFile(file.path, "utf8")));
  const session = toExportSession(record);
  if (!session) {
    throw new Error(`${file.path} isn't an \`opencode export\` file`);
  }
  return {
    ...session,
    childSessions: (asArray(record?.["childSessions"]) ?? []).flatMap(
      (child) => {
        const childSession = toExportSession(child);
        return childSession ? [childSession] : [];
      },
    ),
    malformedRows: (asArray(record?.["malformedRows"]) ??
      []) as OpenCodeMalformedRow[],
  };
};

/** Drops messages without `info`, which the converter needs. */
const toExportSession = (value: unknown): OpenCodeExportSession | null => {
  const record = asRecord(value);
  const info = asRecord(record?.["info"]);
  const messages = asArray(record?.["messages"]);
  if (!info || !messages) {
    return null;
  }
  return {
    info,
    messages: messages.flatMap((message) => {
      const messageRecord = asRecord(message);
      const messageInfo = asRecord(messageRecord?.["info"]);
      const parts = (asArray(messageRecord?.["parts"]) ?? []).flatMap(
        toRecords,
      );
      return messageInfo ? [{ info: messageInfo, parts }] : [];
    }),
  };
};

const withoutDuplicates = (
  rootId: string,
  sessions: OpenCodeExportSession[],
): OpenCodeExportSession[] => {
  const seen = new Set([rootId]);
  return sessions.filter((session) => {
    const id = asNonEmptyString(session.info["id"]) ?? "";
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
};

const toRecords = (value: unknown): JsonRecord[] => {
  const record = asRecord(value);
  return record ? [record] : [];
};
