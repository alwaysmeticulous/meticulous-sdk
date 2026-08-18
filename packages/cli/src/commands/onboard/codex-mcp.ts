import { existsSync, readFileSync } from "fs";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveSafeWritePath, writeFileSafeSync } from "./safe-repo-fs";

/**
 * Writes the canonical Meticulous MCP server into a Codex `config.toml`,
 * stripping any repo-supplied definition first. Codex binds the first table it
 * sees under `mcp_servers.Meticulous`, so a leftover stdio server (with
 * `command`/`args`) would keep running under the official name — hence the
 * careful, TOML-aware sanitisation below.
 */
export const mergeCodexMcp = (
  projectRoot: string,
  relativePath: string,
  mcpUrl: string,
): void => {
  const absolutePath = resolveSafeWritePath(projectRoot, relativePath);
  const existing = existsSync(absolutePath)
    ? readFileSync(absolutePath, "utf8")
    : "";

  // Strip every Meticulous table (duplicates and nested
  // `[mcp_servers.Meticulous.*]` included). A single canonical body is the
  // only case that may stay as-is.
  const sectionBodies: string[] = [];
  let remainder = existing;
  for (;;) {
    const split = splitCodexMeticulousSection(remainder);
    if (split.sectionBody === null) {
      remainder = split.remainder;
      break;
    }
    sectionBodies.push(split.sectionBody);
    remainder = split.remainder;
  }

  // Stripping `[table]` headers is safe, but assignments are not: their values
  // can span lines, and a complete `mcp_servers` value cannot be extended with
  // a sub-table at all. Abort instead of writing something broken.
  const blocker = findCodexBlocker(remainder);
  if (blocker !== null) {
    throw new CliUserError(
      blocker.kind === "meticulous-definition"
        ? `${relativePath} defines the Meticulous MCP server as \`${blocker.line}\`, ` +
            `which onboard cannot safely rewrite. Remove that entry and re-run onboard.`
        : `${relativePath} assigns \`mcp_servers\` a complete value ` +
            `(\`${blocker.line}\`). TOML does not allow adding ` +
            `\`[mcp_servers.Meticulous]\` to it, so onboard cannot configure the ` +
            `MCP server. Rewrite it as a \`[mcp_servers]\` table (removing any ` +
            `Meticulous entry), then re-run onboard.`,
    );
  }

  // Same rule as JSON: the section must exist *and* contain only the
  // canonical `url` — a bare header (or a header with `command`/`args`/etc.)
  // must be overwritten.
  if (
    sectionBodies.length === 1 &&
    isCanonicalCodexMeticulousSectionBody(sectionBodies[0], mcpUrl)
  ) {
    return;
  }

  const base =
    remainder.length === 0 || remainder.endsWith("\n")
      ? remainder
      : `${remainder}\n`;
  const leadingNewline = base.length === 0 ? "" : "\n";
  writeFileSafeSync(
    projectRoot,
    relativePath,
    `${base}${leadingNewline}[mcp_servers.Meticulous]\nurl = "${mcpUrl}"\n`,
  );
};

/** Decodes a TOML basic-string body so `"Metic\u0075lous"` compares equal. */
const decodeTomlBasicString = (raw: string): string | null => {
  const simple: Record<string, string> = {
    b: "\b",
    t: "\t",
    n: "\n",
    f: "\f",
    r: "\r",
    '"': '"',
    "\\": "\\",
  };
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "\\") {
      out += raw[index];
      continue;
    }
    index += 1;
    const escape = raw[index];
    if (escape === undefined) {
      return null;
    }
    if (escape === "u" || escape === "U") {
      const width = escape === "u" ? 4 : 8;
      const hex = raw.slice(index + 1, index + 1 + width);
      if (hex.length !== width || !/^[0-9a-fA-F]+$/u.test(hex)) {
        return null;
      }
      out += String.fromCodePoint(parseInt(hex, 16));
      index += width;
      continue;
    }
    const decoded = simple[escape];
    if (decoded === undefined) {
      return null;
    }
    out += decoded;
  }
  return out;
};

/** Reads one TOML key (bare, basic-quoted or literal-quoted) at `start`. */
const readTomlKey = (
  line: string,
  start: number,
): { key: string; next: number } | null => {
  const quote = line[start];
  if (quote === '"' || quote === "'") {
    let index = start + 1;
    let raw = "";
    while (index < line.length) {
      const char = line[index];
      if (quote === '"' && char === "\\") {
        raw += line.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === quote) {
        const key = quote === '"' ? decodeTomlBasicString(raw) : raw;
        return key === null ? null : { key, next: index + 1 };
      }
      raw += char;
      index += 1;
    }
    return null;
  }

  const bare = /^[A-Za-z0-9_-]+/u.exec(line.slice(start));
  return bare ? { key: bare[0], next: start + bare[0].length } : null;
};

const skipTomlSpace = (line: string, start: number): number => {
  let index = start;
  while (line[index] === " " || line[index] === "\t") {
    index += 1;
  }
  return index;
};

/**
 * Parses a TOML table header into its key path, or `null` when the line is not
 * a header. Accepts everything TOML permits and the previous regex did not:
 * indentation, whitespace around `[`, `.` and `]`, quoted keys, array-of-table
 * `[[...]]` headers, and a trailing comment.
 */
const parseTomlTableHeaderPath = (line: string): string[] | null => {
  let index = skipTomlSpace(line, 0);
  if (line[index] !== "[") {
    return null;
  }
  index += 1;
  const isArrayOfTables = line[index] === "[";
  if (isArrayOfTables) {
    index += 1;
  }

  const path: string[] = [];
  for (;;) {
    index = skipTomlSpace(line, index);
    const key = readTomlKey(line, index);
    if (!key) {
      return null;
    }
    path.push(key.key);
    index = skipTomlSpace(line, key.next);

    if (line[index] === ".") {
      index += 1;
      continue;
    }
    if (line[index] === "]") {
      index += 1;
      break;
    }
    return null;
  }

  if (isArrayOfTables) {
    if (line[index] !== "]") {
      return null;
    }
    index += 1;
  }

  index = skipTomlSpace(line, index);
  // Callers may pass the line with its terminator still attached.
  const trailing = line.slice(index).replace(/\r?\n?$/u, "");
  if (trailing.length > 0 && !trailing.startsWith("#")) {
    return null;
  }
  return path;
};

/**
 * Parses the dotted key path of a TOML assignment (`a.b = …`), so a value
 * assignment can be compared against the table a `[header]` would define.
 */
const parseTomlAssignmentKeyPath = (line: string): string[] | null => {
  let index = skipTomlSpace(line, 0);
  if (index >= line.length || line[index] === "#" || line[index] === "[") {
    return null;
  }

  const path: string[] = [];
  for (;;) {
    index = skipTomlSpace(line, index);
    const key = readTomlKey(line, index);
    if (!key) {
      return null;
    }
    path.push(key.key);
    index = skipTomlSpace(line, key.next);

    if (line[index] === ".") {
      index += 1;
      continue;
    }
    return line[index] === "=" ? path : null;
  }
};

const isMeticulousMcpPath = (path: string[]): boolean =>
  path.length >= 2 && path[0] === "mcp_servers" && path[1] === "Meticulous";

/** Why onboard cannot rewrite a Codex config in place. */
type CodexBlocker =
  | { kind: "meticulous-definition"; line: string }
  | { kind: "inextensible-mcp-servers"; line: string };

/**
 * Finds an assignment that stops onboard from writing the canonical table:
 *
 * - a Meticulous definition outside a `[table]` header (a dotted assignment, or
 *   an inline table under `[mcp_servers]`), which can carry `command`/`args`;
 * - a direct value assignment to root `mcp_servers` (`mcp_servers = { … }` or a
 *   scalar). TOML treats those as complete values, so appending
 *   `[mcp_servers.Meticulous]` would produce a file Codex cannot parse.
 *
 * A dotted `mcp_servers.Other = …` is fine — TOML allows adding sub-tables to
 * tables defined that way.
 */
const findCodexBlocker = (contents: string): CodexBlocker | null => {
  let table: string[] = [];
  for (const rawLine of contents.split(/\r?\n/u)) {
    const headerPath = parseTomlTableHeaderPath(rawLine);
    if (headerPath) {
      table = headerPath;
      continue;
    }
    const keyPath = parseTomlAssignmentKeyPath(rawLine);
    if (!keyPath) {
      continue;
    }
    const combined = [...table, ...keyPath];
    if (isMeticulousMcpPath(combined)) {
      return { kind: "meticulous-definition", line: rawLine.trim() };
    }
    if (combined.length === 1 && combined[0] === "mcp_servers") {
      return { kind: "inextensible-mcp-servers", line: rawLine.trim() };
    }
  }
  return null;
};

/**
 * Splits out `[mcp_servers.Meticulous]` or a nested
 * `[mcp_servers.Meticulous.*]` table and its body. `sectionBody` is `null`
 * when no such section is present. Callers that must remove every copy
 * should loop until `sectionBody` is `null`.
 */
export const splitCodexMeticulousSection = (
  contents: string,
): { remainder: string; sectionBody: string | null } => {
  const lines = contents.split(/(?<=\n)/u);
  const headerIndex = lines.findIndex((line) => {
    const path = parseTomlTableHeaderPath(line);
    return path !== null && isMeticulousMcpPath(path);
  });
  if (headerIndex === -1) {
    return { remainder: contents, sectionBody: null };
  }

  // The section body runs until the next header of any table.
  let bodyEndIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (parseTomlTableHeaderPath(lines[index]) !== null) {
      bodyEndIndex = index;
      break;
    }
  }

  const sectionBody = lines.slice(headerIndex + 1, bodyEndIndex).join("");
  const before = lines.slice(0, headerIndex).join("");
  const afterSection = lines.slice(bodyEndIndex).join("");

  const cleanedBefore = before.replace(/(?:\r?\n)+$/u, "\n");
  const remainder =
    cleanedBefore.length === 0
      ? afterSection.replace(/^(?:\r?\n)+/u, "")
      : `${cleanedBefore}${afterSection}`;

  return { remainder, sectionBody };
};

/**
 * Accepts only blank lines and a single `url = "<canonical>"` assignment
 * (optional surrounding whitespace / quotes). Any other key rejects.
 */
export const isCanonicalCodexMeticulousSectionBody = (
  sectionBody: string,
  mcpUrl: string,
): boolean => {
  let sawUrl = false;
  for (const rawLine of sectionBody.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const match = /^url\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/u.exec(line);
    if (!match || sawUrl) {
      return false;
    }
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== mcpUrl) {
      return false;
    }
    sawUrl = true;
  }
  return sawUrl;
};
