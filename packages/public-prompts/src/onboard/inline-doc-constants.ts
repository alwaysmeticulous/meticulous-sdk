import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

/**
 * The bundled docs are the webapp-frontend doc modules: markdown inside template
 * literals that splice in constants, some of which live in other modules (the
 * GitLab and Bitbucket linking steps, action names, doc URLs). The docs site
 * interpolates those when it renders; the onboard agent only ever sees the raw
 * source, where they read as `${linkGitLabInstructions}` instead of as steps.
 *
 * So we inline the imported constants when copying a doc into the workspace.
 * References to a constant defined in the same file are left alone: the agent is
 * already reading that file, and inlining them would duplicate large blocks
 * (whole workflow YAMLs) for no gain. Anything we cannot follow — a function
 * call, a value from an npm package — is also left as-is.
 */
export const inlineImportedDocConstants = (options: {
  source: string;
  /** Absolute path of the doc being copied, used to resolve relative imports. */
  docPath: string;
  /** Root that bare `src/...` import specifiers resolve against. */
  webappRoot: string;
}): string => {
  const { source, docPath, webappRoot } = options;
  const scope = moduleScope(docPath, source, webappRoot);
  if (scope.imports.size === 0) {
    return source;
  }

  return interpolate(
    source,
    (name) => {
      // A same-file constant is readable in place, so only imports are inlined.
      if (scope.consts.has(name) || !scope.imports.has(name)) {
        return null;
      }
      return resolveIdentifier(name, scope, new Set());
    },
    { unescape: false },
  );
};

interface Literal {
  quote: "`" | '"' | "'";
  body: string;
}

interface ModuleScope {
  filePath: string;
  webappRoot: string;
  /** First (i.e. top-level) literal declaration of each constant. */
  consts: Map<string, Literal>;
  /** Local binding name to what it was imported, and from where. */
  imports: Map<string, ImportedBinding>;
}

interface ImportedBinding {
  specifier: string;
  /** The exported name, which `import { a as b }` renames. */
  exportedName: string;
}

const moduleScope = (
  filePath: string,
  source: string,
  webappRoot: string,
): ModuleScope => ({
  filePath,
  webappRoot,
  consts: collectConstLiterals(source),
  imports: collectPrologueImports(source),
});

const moduleCache = new Map<string, ModuleScope>();

const loadModule = (
  specifier: string,
  from: ModuleScope,
): ModuleScope | null => {
  const filePath = resolveSpecifier(specifier, from);
  if (filePath === null) {
    return null;
  }
  const cacheKey = `${from.webappRoot}\n${filePath}`;
  const cached = moduleCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const scope = moduleScope(
    filePath,
    readFileSync(filePath, "utf8"),
    from.webappRoot,
  );
  moduleCache.set(cacheKey, scope);
  return scope;
};

/**
 * Only relative doc modules and the webapp's own `src/...` modules are
 * followed; npm package specifiers have no source to read here.
 */
const resolveSpecifier = (
  specifier: string,
  from: ModuleScope,
): string | null => {
  const base = specifier.startsWith(".")
    ? join(dirname(from.filePath), specifier)
    : specifier.startsWith("src/")
      ? join(from.webappRoot, specifier)
      : null;
  if (base === null) {
    return null;
  }
  const candidate = base.endsWith(".ts") ? base : `${base}.ts`;
  return existsSync(candidate) ? candidate : null;
};

/** Resolves `name` to a plain string, following imports and nested references. */
const resolveIdentifier = (
  name: string,
  scope: ModuleScope,
  visiting: Set<string>,
): string | null => {
  const key = `${scope.filePath}#${name}`;
  if (visiting.has(key)) {
    return null;
  }

  const literal = scope.consts.get(name);
  if (literal) {
    visiting.add(key);
    const value = evaluateLiteral(literal, scope, visiting);
    visiting.delete(key);
    return value;
  }

  const binding = scope.imports.get(name);
  if (binding === undefined) {
    return null;
  }
  const imported = loadModule(binding.specifier, scope);
  return imported === null
    ? null
    : resolveIdentifier(binding.exportedName, imported, visiting);
};

const evaluateLiteral = (
  literal: Literal,
  scope: ModuleScope,
  visiting: Set<string>,
): string =>
  literal.quote === "`"
    ? interpolate(
        literal.body,
        (name) => resolveIdentifier(name, scope, visiting),
        { unescape: true },
      )
    : unescapeLiteralBody(literal.body);

/**
 * Rewrites every `${...}` that `resolve` can turn into a string, leaving the
 * rest untouched. `unescape` distinguishes the two uses: evaluating a template
 * literal body yields its real text (so `\${x}` becomes literal `${x}` and is
 * not substituted), whereas rewriting a doc file in place must preserve the
 * source exactly apart from the placeholders it replaces.
 */
const interpolate = (
  content: string,
  resolve: (name: string) => string | null,
  options: { unescape: boolean },
): string => {
  let output = "";
  let index = 0;
  while (index < content.length) {
    if (content[index] === "\\" && index + 1 < content.length) {
      const escaped = content[index + 1];
      output += options.unescape
        ? (ESCAPES[escaped] ?? escaped)
        : content.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (content[index] !== "$" || content[index + 1] !== "{") {
      output += content[index];
      index += 1;
      continue;
    }
    const end = findClosingBrace(content, index + 2);
    if (end === null) {
      output += content.slice(index);
      break;
    }
    const expression = content.slice(index + 2, end).trim();
    const resolved = IDENTIFIER.test(expression) ? resolve(expression) : null;
    output += resolved ?? content.slice(index, end + 1);
    index = end + 1;
  }
  return output;
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const findClosingBrace = (content: string, start: number): number | null => {
  let depth = 0;
  for (let index = start; index < content.length; index++) {
    const char = content[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return null;
};

const CONST_DECLARATION =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*(?::[^=\n]+)?=[\s]*/g;

/**
 * Collects the string and template-literal constants of a module. Code samples
 * inside the docs declare constants too, so the first declaration of a name
 * wins: top-level declarations always come before the prose that quotes them.
 */
const collectConstLiterals = (source: string): Map<string, Literal> => {
  const consts = new Map<string, Literal>();
  for (const match of source.matchAll(CONST_DECLARATION)) {
    const name = match[1];
    if (consts.has(name)) {
      continue;
    }
    const literal = readLiteralAt(source, match.index + match[0].length);
    if (literal) {
      consts.set(name, literal);
    }
  }
  return consts;
};

const readLiteralAt = (source: string, start: number): Literal | null => {
  const quote = source[start];
  if (quote !== "`" && quote !== '"' && quote !== "'") {
    return null;
  }
  let depth = 0;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      depth += 1;
      index += 2;
      continue;
    }
    if (quote === "`" && depth > 0 && char === "}") {
      depth -= 1;
      index += 1;
      continue;
    }
    if (char === quote && depth === 0) {
      return { quote, body: source.slice(start + 1, index) };
    }
    if (quote !== "`" && char === "\n") {
      return null;
    }
    index += 1;
  }
  return null;
};

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

/** A quoted string has no interpolation, so nothing resolves. */
const unescapeLiteralBody = (body: string): string =>
  interpolate(body, () => null, { unescape: true });

const IMPORT_STATEMENT = /^import[\s]+([\s\S]*?)[\s]+from[\s]*"([^"]+)";/gm;
const DECLARATION_START =
  /^(?:export[ \t]+)?(?:const|type|interface|function|class)[ \t]/m;

/**
 * Reads the import prologue only. The docs quote `import ... from "..."` lines
 * inside code samples, and those are not this module's own imports.
 */
const collectPrologueImports = (
  source: string,
): Map<string, ImportedBinding> => {
  const declarationStart = source.search(DECLARATION_START);
  const prologue =
    declarationStart === -1 ? source : source.slice(0, declarationStart);

  const imports = new Map<string, ImportedBinding>();
  for (const match of prologue.matchAll(IMPORT_STATEMENT)) {
    const specifier = match[2];
    const named = match[1].match(/\{([\s\S]*)\}/);
    if (!named) {
      continue;
    }
    for (const binding of named[1].split(",")) {
      const [exportedName, localName] = binding
        .trim()
        .replace(/^type[ \t]+/, "")
        .split(/[ \t]+as[ \t]+/)
        .map((part) => part.trim());
      if (!exportedName || !IDENTIFIER.test(exportedName)) {
        continue;
      }
      imports.set(localName ?? exportedName, { specifier, exportedName });
    }
  }
  return imports;
};
