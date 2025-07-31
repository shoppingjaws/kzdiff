#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { formatYamlDiff } from "./diff";

// Parse command line arguments
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    help: {
      type: "boolean",
      short: "h",
    },
    "base-branch": {
      type: "string",
      short: "b",
      default: "main",
    },
    remote: {
      type: "string",
      short: "r",
    },
    "no-color": {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

function showHelp() {
  console.log(`
kzdiff - Compare Kustomize build results

Usage:
  kzdiff [target-dir]                    # Compare local changes with base branch
  kzdiff -r <repo-url> <path>            # Compare remote repository paths
  kzdiff -r <repo-url> <path> -b <branch> # Compare against specific branch

Options:
  -h, --help           Show help
  -b, --base-branch    Base branch to compare (default: main)
  -r, --remote         Remote repository URL
  --no-color           Disable colored output

Examples:
  # Compare local directory
  kzdiff ./overlays/production

  # Compare remote repository
  kzdiff -r https://github.com/kubernetes-sigs/kustomize.git /examples/springboot/base

  # Compare specific branches
  kzdiff -b develop
`);
}

// Find kustomize executable
async function findKustomize(): Promise<string> {
  try {
    const which = await Bun.$`which kustomize`.text();
    return which.trim();
  } catch {
    // Try common locations
    const paths = [
      "/Users/shoppingjaws/.local/share/mise/installs/kustomize/5.7.0/kustomize",
      "/usr/local/bin/kustomize",
      "/opt/homebrew/bin/kustomize",
    ];
    
    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    throw new Error("kustomize not found. Please install kustomize.");
  }
}

// Build from a directory
async function buildKustomize(dir: string): Promise<string> {
  const kustomizePath = await findKustomize();
  return await Bun.$`cd ${dir} && ${kustomizePath} build .`.text();
}

// Compare local repository
async function compareLocal(targetDir: string, baseBranch: string): Promise<void> {
  // Check if in git repository
  try {
    await Bun.$`cd ${targetDir} && git rev-parse --git-dir`.quiet();
  } catch {
    throw new Error("Not in a git repository");
  }

  // Check if kustomization.yaml exists
  if (!existsSync(join(targetDir, "kustomization.yaml"))) {
    throw new Error("No kustomization.yaml found in target directory");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "kzdiff-"));
  
  try {
    // Get current branch and check for changes
    const currentBranch = await Bun.$`cd ${targetDir} && git branch --show-current`.text();
    const hasChanges = await Bun.$`cd ${targetDir} && git status --porcelain`.text();
    const needsStash = hasChanges.trim().length > 0;

    // Stash if needed
    if (needsStash) {
      await Bun.$`cd ${targetDir} && git stash push -m "kzdiff temporary"`.quiet();
    }

    try {
      // Get base branch build
      await Bun.$`cd ${targetDir} && git checkout ${baseBranch}`.quiet();
      const baseBuild = await buildKustomize(targetDir);

      // Get current branch build
      await Bun.$`cd ${targetDir} && git checkout ${currentBranch.trim()}`.quiet();
      if (needsStash) {
        await Bun.$`cd ${targetDir} && git stash pop`.quiet();
      }
      const currentBuild = await buildKustomize(targetDir);

      // Show diff
      const diff = formatYamlDiff(baseBuild, currentBuild, baseBranch, "current", {
        color: !values["no-color"],
      });
      console.log(diff);
    } finally {
      // Restore state
      await Bun.$`cd ${targetDir} && git checkout ${currentBranch.trim()}`.quiet();
      if (needsStash && await Bun.$`cd ${targetDir} && git stash list`.text().then(s => s.includes("kzdiff temporary"))) {
        await Bun.$`cd ${targetDir} && git stash pop`.quiet();
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Compare remote repository
async function compareRemote(repo: string, path: string, baseBranch: string): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "kzdiff-remote-"));
  
  try {
    // Clone and build base branch
    console.log(`Fetching ${baseBranch}...`);
    await Bun.$`git clone --depth 1 --branch ${baseBranch} ${repo} ${tempDir}/base`.quiet();
    const baseBuild = await buildKustomize(join(tempDir, "base", path));

    // For remote, just show the build result for now
    console.log(`Build result from ${baseBranch}:`);
    console.log(baseBuild);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Main
async function main() {
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Disable colors if requested
  if (values["no-color"]) {
    process.env.FORCE_COLOR = "0";
  }

  try {
    if (values.remote) {
      // Remote mode
      const repo = values.remote as string;
      const path = positionals[2] || "/";
      await compareRemote(repo, path, values["base-branch"] as string);
    } else {
      // Local mode
      const targetDir = positionals[2] || process.cwd();
      await compareLocal(targetDir, values["base-branch"] as string);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();