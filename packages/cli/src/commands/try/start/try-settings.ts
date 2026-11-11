import type { PackageManager } from "../shared/try-context";

const BASE_ALLOW = [
  "Read",
  "Edit",
  "Write",
  "Grep",
  "Glob",
  "Task",
  "TodoWrite",
  "BashOutput",
  "KillShell",
  "WebFetch(domain:app.meticulous.ai)",
  "mcp__Meticulous",
  "Bash(meticulous:*)",
  "Bash(npx @alwaysmeticulous/cli:*)",
  "Bash(agent-browser:*)",
  "Bash(npm install -g agent-browser)",
  "Bash(seq:*)",
  "Bash(git worktree:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git diff:*)",
  "Bash(git rev-parse:*)",
  "Bash(git status:*)",
  "Bash(git merge-base:*)",
  "Bash(git cat-file:*)",
  "Bash(git ls-files:*)",
  "Bash(docker build:*)",
  "Bash(docker run:*)",
  "Bash(docker ps:*)",
  "Bash(docker logs:*)",
  "Bash(docker stop:*)",
  "Bash(docker rm:*)",
  "Bash(docker images:*)",
  "Bash(docker image inspect:*)",
  "Bash(docker compose:*)",
  "Bash(npx serve:*)",
  "Bash(npx --yes serve:*)",
  "Bash(npx http-server:*)",
  "Bash(npx --yes http-server:*)",
  "Bash(curl -s http://localhost:*)",
  "Bash(curl -sf http://localhost:*)",
  "Bash(curl -sS http://localhost:*)",
  "Bash(curl -s http://127.0.0.1:*)",
  "Bash(curl -sf http://127.0.0.1:*)",
  "Bash(lsof -i:*)",
  "Bash(lsof -ti:*)",
  "Bash(kill:*)",
  "Bash(xargs kill:*)",
  "Bash(nproc)",
  "Bash(sysctl -n hw.ncpu)",
  "Bash(sysctl -n hw.memsize)",
  "Bash(free -g)",
  "Bash(df -h:*)",
  "Bash(pkill -f:*)",
  "Bash(pgrep:*)",
  "Bash(sleep:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(wc:*)",
  "Bash(find:*)",
  "Bash(mkdir:*)",
  "Bash(rmdir:*)",
  "Bash(cp:*)",
  "Bash(node --version)",
  "Bash(jq:*)",
];

/** History-rewriting and publishing commands: the trial must never touch the user's branches. */
const DENY = [
  "Bash(git push:*)",
  "Bash(git commit:*)",
  "Bash(git reset:*)",
  "Bash(git checkout:*)",
  "Bash(git switch:*)",
  "Bash(git stash:*)",
  "Bash(git rebase:*)",
  "Bash(git merge:*)",
  "Bash(git clean:*)",
  "Bash(git branch -D:*)",
  "Bash(gh pr create:*)",
  "Bash(glab mr create:*)",
  "Bash(meticulous auth set-project:*)",
  "Bash(meticulous auth login:*)",
  "mcp__Meticulous__set_project",
];

const packageManagerAllow = (
  packageManager: PackageManager | null,
): string[] => {
  const managers: PackageManager[] = packageManager
    ? [packageManager]
    : ["npm", "pnpm", "yarn", "bun"];
  return managers.flatMap((manager) => [
    `Bash(${manager}:*)`,
    ...(manager === "npm" ? ["Bash(npx:*)"] : []),
    ...(manager === "pnpm" ? ["Bash(pnpx:*)"] : []),
    ...(manager === "bun" ? ["Bash(bunx:*)"] : []),
    ...(manager === "yarn" ? ["Bash(corepack:*)"] : []),
  ]);
};

/**
 * Permissions for the try workspace, in the style of onboard's settings: an
 * allowlist for everything the playbook runs (the Meticulous CLI, worktrees,
 * the repo's package manager, Docker, local dev servers and browser driving)
 * so the run is not interrupted by prompts, plus a denylist for git writes and
 * for changing the user's account-wide default project. `env` repeats the
 * agent's pinned, non-secret environment, so a session started by hand in the
 * workspace still uses the trial's data dir and endpoints.
 */
export const buildTrySettings = (
  packageManager: PackageManager | null,
  env: Record<string, string>,
): Record<string, unknown> => ({
  env,
  permissions: {
    defaultMode: "default",
    allow: [...BASE_ALLOW, ...packageManagerAllow(packageManager)],
    deny: DENY,
  },
  enabledMcpjsonServers: ["Meticulous"],
});
