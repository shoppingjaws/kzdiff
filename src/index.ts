#!/usr/bin/env bun

import { $ } from "bun";
import { kustomizeBuildToTmp } from "./kustomize";
import { createDebugLogger } from "./debug";
import { showDiff } from "./diff";

const debug = createDebugLogger("kzdiff-cli");

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("Usage: bun run index.ts <kustomize-path>");
    console.error("Example: bun run index.ts ./examples/overlays/prod");
    process.exit(1);
  }
  
  const kustomizePath = args[0];
  debug(`Processing path: ${kustomizePath}`);
  
  try {
    // Get current git remote and branch
    const remoteUrl = await $`git config --get remote.origin.url`.text();
    const remote = remoteUrl.trim();
    const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text();
    const branch = currentBranch.trim();
    
    debug(`Remote: ${remote}`);
    debug(`Current branch: ${branch}`);
    
    // Build local version
    console.log("Building local version...");
    const localPath = await kustomizeBuildToTmp(kustomizePath, "after.yaml");
    debug(`Local build saved to: ${localPath}`);
    
    // Build remote version (from main branch)
    console.log("Building remote version (main branch)...");
    const remotePath = await kustomizeBuildToTmp(
      kustomizePath,
      "before.yaml",
      undefined,
      { ref: "main", remote }
    );
    debug(`Remote build saved to: ${remotePath}`);
    
    // Show diff
    console.log("\nShowing diff between main branch and local changes:");
    console.log("=" .repeat(80));
    
    // Use the diff module to show differences
    await showDiff(remotePath, localPath, { 
      tool: "git-diff",  // Try git-diff first for better colors
      color: true,
      context: 3
    });
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the CLI
main();