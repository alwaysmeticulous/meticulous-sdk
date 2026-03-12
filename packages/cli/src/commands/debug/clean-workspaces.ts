import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { getDebugSessionsDir } from "@alwaysmeticulous/debug-workspace";
import chalk from "chalk";
import inquirer from "inquirer";

interface CleanWorkspacesOptions {
  all?: boolean;
  beforeDelete?: (workspaceDir: string) => void;
}

export const cleanWorkspaces = async (
  options: CleanWorkspacesOptions = {},
): Promise<void> => {
  const debugSessionsDir = getDebugSessionsDir();

  if (!existsSync(debugSessionsDir)) {
    console.log("No debug workspaces found.");
    return;
  }

  const entries = readdirSync(debugSessionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));

  if (entries.length === 0) {
    console.log("No debug workspaces found.");
    return;
  }

  const workspaceInfos = entries.map((entry) => {
    const fullPath = join(debugSessionsDir, entry.name);
    const size = getDirectorySize(fullPath);
    return { name: entry.name, path: fullPath, size };
  });

  console.log(`\nFound ${entries.length} debug workspace(s):\n`);
  for (const ws of workspaceInfos) {
    console.log(`  ${ws.name}  (${formatSize(ws.size)})`);
  }

  const totalSize = workspaceInfos.reduce((sum, ws) => sum + ws.size, 0);
  console.log(`\nTotal: ${formatSize(totalSize)}`);

  if (options.all) {
    for (const ws of workspaceInfos) {
      deleteWorkspace(ws.path, ws.name, options.beforeDelete);
    }
    console.log(`\nDeleted ${entries.length} workspace(s).`);
    return;
  }

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Delete all workspaces", value: "all" },
        { name: "Select workspaces to delete", value: "select" },
        { name: "Cancel", value: "cancel" },
      ],
    },
  ]);

  if (action === "cancel") {
    console.log("No workspaces deleted.");
    return;
  }

  if (action === "all") {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Delete all ${entries.length} workspace(s) (${formatSize(totalSize)})?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log("No workspaces deleted.");
      return;
    }

    for (const ws of workspaceInfos) {
      deleteWorkspace(ws.path, ws.name, options.beforeDelete);
    }
    console.log(`Deleted ${entries.length} workspace(s).`);
    return;
  }

  if (action === "select") {
    const { selected } = await inquirer.prompt<{ selected: string[] }>([
      {
        type: "checkbox",
        name: "selected",
        message: "Select workspaces to delete:",
        choices: workspaceInfos.map((ws) => ({
          name: `${ws.name}  (${formatSize(ws.size)})`,
          value: ws.path,
        })),
      },
    ]);

    if (selected.length === 0) {
      console.log("No workspaces selected.");
      return;
    }

    for (const path of selected) {
      const ws = workspaceInfos.find((w) => w.path === path);
      deleteWorkspace(path, ws?.name ?? path, options.beforeDelete);
    }
    console.log(`Deleted ${selected.length} workspace(s).`);
  }
};

const deleteWorkspace = (
  fullPath: string,
  name: string,
  beforeDelete?: (workspaceDir: string) => void,
): void => {
  if (beforeDelete) {
    beforeDelete(fullPath);
  }
  try {
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`  Deleted: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(`  Warning: Could not delete ${name}: ${message}`),
    );
  }
};

const getDirectorySize = (dirPath: string): number => {
  let size = 0;
  try {
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) {
        size += getDirectorySize(fullPath);
      } else {
        try {
          size += statSync(fullPath).size;
        } catch {
          // Ignore stat errors for individual files
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return size;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};
