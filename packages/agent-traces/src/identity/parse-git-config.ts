export interface GitConfigEntry {
  /** Lower-cased. */
  section: string;
  /** Case-sensitive, as in git. */
  subsection: string | null;
  /** Lower-cased. */
  key: string;
  value: string;
}

const SECTION_REGEX = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/;
const KEY_REGEX = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=(.*))?$/;

/**
 * Parses git-config syntax well enough to read identity and remotes:
 * sections, subsections (both `[a "b"]` and legacy `[a.b]`), quoting,
 * escapes, comments, line continuations and valueless (boolean) keys.
 */
export const parseGitConfig = (text: string): GitConfigEntry[] => {
  const entries: GitConfigEntry[] = [];
  let section: string | null = null;
  let subsection: string | null = null;
  for (const line of joinContinuations(text)) {
    let rest = line.trim();
    const sectionMatch = SECTION_REGEX.exec(rest);
    if (sectionMatch) {
      ({ section, subsection } = parseSectionHeader(
        sectionMatch[1] ?? "",
        sectionMatch[2],
      ));
      rest = rest.slice(sectionMatch[0].length).trim();
    }
    if (!rest || rest.startsWith("#") || rest.startsWith(";") || !section) {
      continue;
    }
    const keyMatch = KEY_REGEX.exec(rest);
    if (!keyMatch) {
      continue;
    }
    entries.push({
      section,
      subsection,
      key: (keyMatch[1] ?? "").toLowerCase(),
      value: keyMatch[2] === undefined ? "true" : parseValue(keyMatch[2]),
    });
  }
  return entries;
};

/** Git's last-one-wins semantics. */
export const getLastGitConfigValue = (
  entries: GitConfigEntry[],
  section: string,
  subsection: string | null,
  key: string,
): string | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry &&
      entry.section === section &&
      entry.subsection === subsection &&
      entry.key === key
    ) {
      return entry.value;
    }
  }
  return null;
};

const parseSectionHeader = (
  name: string,
  quotedSubsection: string | undefined,
): { section: string; subsection: string | null } => {
  if (quotedSubsection !== undefined) {
    return {
      section: name.toLowerCase(),
      subsection: quotedSubsection.replace(/\\(.)/g, "$1"),
    };
  }
  const dot = name.indexOf(".");
  if (dot === -1) {
    return { section: name.toLowerCase(), subsection: null };
  }
  // Legacy `[section.subsection]` syntax lower-cases the subsection.
  return {
    section: name.slice(0, dot).toLowerCase(),
    subsection: name.slice(dot + 1).toLowerCase(),
  };
};

const parseValue = (raw: string): string => {
  let result = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === "\\" && i + 1 < raw.length) {
      const next = raw[++i];
      result += next === "n" ? "\n" : next === "t" ? "\t" : (next ?? "");
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === "#" || char === ";") && !inQuotes) {
      break;
    } else {
      result += char;
    }
  }
  return result.trim();
};

const joinContinuations = (text: string): string[] => {
  const lines: string[] = [];
  let pending = "";
  for (const line of text.split(/\r?\n/)) {
    if (/(^|[^\\])(\\\\)*\\$/.test(line)) {
      pending += line.slice(0, -1);
      continue;
    }
    lines.push(pending + line);
    pending = "";
  }
  if (pending) {
    lines.push(pending);
  }
  return lines;
};
