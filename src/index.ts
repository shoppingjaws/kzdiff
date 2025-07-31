#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { join } from "node:path";
import { kzdiff } from "./kzdiff";

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
    "no-color": {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

function showHelp() {
  console.log(`
kzdiff - Compare Kustomize build results between branches

Usage:
  kzdiff [target-dir]

Arguments:
  target-dir    Kustomize directory to compare (default: current directory)

Options:
  -h, --help           Show this help message
  -b, --base-branch    Base branch to compare against (default: main)
  --no-color           Disable colored output

Examples:
  kzdiff                              # Compare current directory
  kzdiff ./overlays/production        # Compare specific overlay
  kzdiff -b master                    # Compare against master branch
`);
}

async function main() {
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Get target directory from positionals (skip first two: bun and script path)
  const targetDir = positionals[2] || process.cwd();

  try {
    // Set color preference globally
    if (values["no-color"]) {
      process.env.FORCE_COLOR = "0";
    }

    const diff = await kzdiff(targetDir, {
      baseBranch: values["base-branch"] as string,
    });

    console.log(diff);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});