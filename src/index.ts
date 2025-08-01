#!/usr/bin/env bun

import { $ } from "bun";
import { kustomizeBuildToTmp } from "./kustomize";
import { createDebugLogger } from "./debug";
import { showDiff } from "./diff";

const debug = createDebugLogger("kzdiff-cli");

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("Usage: bun run index.ts <kustomize-path> [options...]");
    console.error("Options:");
    console.error("  -b, --branch <branch>    Remote branch to compare against (default: main)");
    console.error("  --                       Pass remaining arguments to kustomize");
    console.error("");
    console.error("Examples:");
    console.error("  bun run index.ts ./examples/overlays/prod");
    console.error("  bun run index.ts ./examples/overlays/prod -b develop");
    console.error("  bun run index.ts ./examples/overlays/prod -- --enable-helm");
    console.error("  bun run index.ts ./examples/overlays/prod -b staging -- --enable-helm");
    process.exit(1);
  }
  
  const kustomizePath = args[0];
  let remoteBranch = "main";
  let kustomizeOptions: string[] = [];
  
  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "-b" || args[i] === "--branch") {
      if (i + 1 < args.length) {
        remoteBranch = args[i + 1];
        i++; // Skip next argument
      } else {
        console.error("Error: -b/--branch requires a branch name");
        process.exit(1);
      }
    } else if (args[i] === "--") {
      // Everything after -- goes to kustomize
      kustomizeOptions = args.slice(i + 1);
      break;
    } else {
      console.error(`Error: Unknown option: ${args[i]}`);
      console.error("Use -- to pass options to kustomize");
      process.exit(1);
    }
  }
  
  debug(`Processing path: ${kustomizePath}`);
  debug(`Remote branch: ${remoteBranch}`);
  if (kustomizeOptions.length > 0) {
    debug(`Kustomize options: ${kustomizeOptions.join(' ')}`);
  }
  
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
    const localPath = await kustomizeBuildToTmp(
      kustomizePath, 
      "after.yaml",
      kustomizeOptions
    );
    debug(`Local build saved to: ${localPath}`);
    
    // Build remote version (from specified branch)
    console.log(`Building remote version (${remoteBranch} branch)...`);
    const remotePath = await kustomizeBuildToTmp(
      kustomizePath,
      "before.yaml",
      kustomizeOptions,
      { ref: remoteBranch, remote }
    );
    debug(`Remote build saved to: ${remotePath}`);
    
    // Show diff
    console.log(`\nShowing diff between ${remoteBranch} branch and local changes:`);
    console.log("=" .repeat(80));
    
    // Use the diff module to show differences
    await showDiff(remotePath, localPath, { 
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