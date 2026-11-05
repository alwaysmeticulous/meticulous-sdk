import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `meticulous try`'s CLAUDE.md, subagents and skills are vendored in this
// package (versioned with the CLI) and shipped verbatim next to the bundle.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(packageRoot, "src", "commands", "try", "templates");
const outputDir = join(packageRoot, "dist", "commands", "try", "templates");

if (!existsSync(join(source, "CLAUDE.md"))) {
  throw new Error(`Missing try templates in ${source}`);
}

rmSync(outputDir, { recursive: true, force: true });
cpSync(source, outputDir, { recursive: true });
