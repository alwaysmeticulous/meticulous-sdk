import { SECRET_PATTERNS } from "./secret-patterns";

/** Replaces anything that looks like a credential with a `[REDACTED:…]` marker. */
export const redactSecrets = (text: string): string =>
  SECRET_PATTERNS.reduce(
    (redacted, { regex, replacement }) =>
      redacted.replace(regex, (...args: unknown[]) =>
        isAlreadyRedacted(args) ? String(args[0]) : expand(replacement, args),
      ),
    text,
  );

/** Keeps a second pattern from re-redacting a marker the first one wrote. */
const isAlreadyRedacted = (args: unknown[]): boolean =>
  String(args[0]).includes("[REDACTED:");

/** Named groups are the last argument `String.replace` passes, when there are any. */
const expand = (replacement: string, args: unknown[]): string => {
  const last = args.at(-1);
  const groups =
    typeof last === "object" && last !== null
      ? (last as Record<string, string | undefined>)
      : {};
  return replacement.replace(
    /\$<(\w+)>/g,
    (_, name: string) => groups[name] ?? "",
  );
};
