#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { kzdiff } from "./kzdiff";

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
    const baseBranch = values["base-branch"] as string;
    const noColor = values["no-color"] as boolean;
    
    if (values.remote) {
      // Remote mode
      const repo = values.remote as string;
      const path = positionals[2] || "/";
      const result = await kzdiff(path, { remote: repo, baseBranch, noColor });
      console.log(result);
    } else {
      // Local mode
      const targetDir = positionals[2] || process.cwd();
      const result = await kzdiff(targetDir, { baseBranch, noColor });
      console.log(result);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();