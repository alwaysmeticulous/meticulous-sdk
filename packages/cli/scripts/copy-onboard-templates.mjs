import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(packageRoot, "dist", "commands", "onboard", "templates");
const onboardSrc = join(packageRoot, "src", "commands", "onboard");
const localTemplates = join(onboardSrc, "templates");
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

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, "agents"), { recursive: true });
cpSync(join(localTemplates, "CLAUDE.md"), join(outputDir, "CLAUDE.md"));
cpSync(join(localTemplates, "settings.json"), join(outputDir, "settings.json"));

for (const agentName of customerAgentNames) {
  cpSync(
    join(canonicalAgents, `${agentName}.md`),
    join(outputDir, "agents", `${agentName}.md`),
  );
}

for (const docPath of docFiles) {
  const dest = join(outputDir, "docs", docPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(canonicalDocs, docPath), dest);
}
for (const docDir of docDirs) {
  cpSync(join(canonicalDocs, docDir), join(outputDir, "docs", docDir), {
    recursive: true,
  });
}

// Mirrored under their `src/...` paths so inlining resolves the docs' imports
// the same way it does when reading straight from the monorepo.
for (const importPath of importFiles) {
  const dest = join(outputDir, "docs-imports", importPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(canonicalWebappFrontend, importPath), dest);
}
