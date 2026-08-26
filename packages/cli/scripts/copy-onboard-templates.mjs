import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(packageRoot, "dist", "commands", "onboard", "templates");
const onboardSrc = join(packageRoot, "src", "commands", "onboard");
const localTemplates = join(onboardSrc, "templates");
// Tracked copy of the agents/docs subset below, checked into this package so
// it can be built standalone in the public meticulous-sdk repo, which has no
// packages/admin-cli or packages/webapp-frontend to read from directly.
const vendoredAgents = join(localTemplates, "vendored", "agents");
const vendoredDocs = join(localTemplates, "vendored", "docs");
const vendoredDocsImports = join(localTemplates, "vendored", "docs-imports");
const canonicalAgents = join(
  packageRoot,
  "..",
  "..",
  "packages",
  "admin-cli",
  "src",
  "cli",
  "onboard",
  "templates",
  "agents",
);
const canonicalWebappFrontend = join(
  packageRoot,
  "..",
  "..",
  "packages",
  "webapp-frontend",
);
const canonicalDocs = join(
  canonicalWebappFrontend,
  "src",
  "components",
  "docs",
  "content",
);

// Shared with materialize-workspace.ts so the published bundle and the
// source-mode fallback agree on which agents customer onboarding may use.
const { customerAgentNames } = JSON.parse(
  readFileSync(join(onboardSrc, "customer-agents.json"), "utf8"),
);
// Same sharing for the docs the agent playbooks cite as `.claude/docs/<path>`,
// plus the webapp modules those docs import constants from.
const { docFiles, docDirs, importFiles } = JSON.parse(
  readFileSync(join(onboardSrc, "customer-docs.json"), "utf8"),
);

// Only present inside this monorepo, not in the public meticulous-sdk repo
// that mirrors public_packages/. When absent, fall back to the vendored copy
// below rather than validating against sources that can't exist there.
const hasCanonicalSources =
  existsSync(canonicalAgents) && existsSync(canonicalWebappFrontend);

let agentsSrc = vendoredAgents;
let docsSrc = vendoredDocs;
let docsImportsSrc = vendoredDocsImports;

if (hasCanonicalSources) {
  agentsSrc = canonicalAgents;
  docsSrc = canonicalDocs;
  docsImportsSrc = canonicalWebappFrontend;

  const missing = customerAgentNames.filter(
    (agentName) => !existsSync(join(canonicalAgents, `${agentName}.md`)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing onboard agent template(s) in ${canonicalAgents}: ${missing.join(", ")}. ` +
        `Update customer-agents.json if these agents were renamed or removed.`,
    );
  }

  const missingDocs = [...docFiles, ...docDirs].filter(
    (docPath) => !existsSync(join(canonicalDocs, docPath)),
  );
  if (missingDocs.length > 0) {
    throw new Error(
      `Missing onboard doc file(s) in ${canonicalDocs}: ${missingDocs.join(", ")}. ` +
        `Update customer-docs.json if these docs were moved or renamed.`,
    );
  }

  const missingImports = importFiles.filter(
    (importPath) => !existsSync(join(canonicalWebappFrontend, importPath)),
  );
  if (missingImports.length > 0) {
    throw new Error(
      `Missing onboard doc import(s) in ${canonicalWebappFrontend}: ${missingImports.join(", ")}. ` +
        `Update customer-docs.json if these modules were moved or renamed.`,
    );
  }

  // Refresh the tracked vendored copy so it stays in sync with the canonical
  // sources. Commit the resulting diff alongside whatever change prompted it -
  // the meticulous-sdk build reads only this vendored copy, never the
  // canonical private packages.
  refreshVendoredCopy();
} else if (
  !existsSync(vendoredAgents) ||
  !existsSync(vendoredDocs) ||
  !existsSync(vendoredDocsImports)
) {
  throw new Error(
    `Vendored onboard templates are missing from ${localTemplates}/vendored. ` +
      `Run this build inside the alwaysmeticulous/meticulous monorepo first to regenerate them.`,
  );
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, "agents"), { recursive: true });
cpSync(join(localTemplates, "CLAUDE.md"), join(outputDir, "CLAUDE.md"));
cpSync(join(localTemplates, "settings.json"), join(outputDir, "settings.json"));

for (const agentName of customerAgentNames) {
  cpSync(
    join(agentsSrc, `${agentName}.md`),
    join(outputDir, "agents", `${agentName}.md`),
  );
}

for (const docPath of docFiles) {
  const dest = join(outputDir, "docs", docPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(docsSrc, docPath), dest);
}
for (const docDir of docDirs) {
  cpSync(join(docsSrc, docDir), join(outputDir, "docs", docDir), {
    recursive: true,
  });
}

// Mirrored under their `src/...` paths so inlining resolves the docs' imports
// the same way it does when reading straight from the monorepo.
for (const importPath of importFiles) {
  const dest = join(outputDir, "docs-imports", importPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(docsImportsSrc, importPath), dest);
}

function refreshVendoredCopy() {
  rmSync(vendoredAgents, { recursive: true, force: true });
  mkdirSync(vendoredAgents, { recursive: true });
  for (const agentName of customerAgentNames) {
    cpSync(
      join(canonicalAgents, `${agentName}.md`),
      join(vendoredAgents, `${agentName}.md`),
    );
  }

  rmSync(vendoredDocs, { recursive: true, force: true });
  mkdirSync(vendoredDocs, { recursive: true });
  for (const docPath of docFiles) {
    const dest = join(vendoredDocs, docPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(canonicalDocs, docPath), dest);
  }
  for (const docDir of docDirs) {
    cpSync(join(canonicalDocs, docDir), join(vendoredDocs, docDir), {
      recursive: true,
    });
  }

  rmSync(vendoredDocsImports, { recursive: true, force: true });
  for (const importPath of importFiles) {
    const dest = join(vendoredDocsImports, importPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(canonicalWebappFrontend, importPath), dest);
  }
}
