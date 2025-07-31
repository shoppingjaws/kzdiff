#!/usr/bin/env bun

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatYamlDiff } from "./diff";

interface CompareOptions {
  repo: string;
  path: string;
  fromBranch: string;
  toBranch: string;
}

async function compareRemoteBranches(options: CompareOptions): Promise<string> {
  const { repo, path, fromBranch, toBranch } = options;
  
  console.log(`Comparing ${fromBranch} vs ${toBranch} for ${repo}${path}`);
  
  // Build from first branch
  const fromBuild = await buildFromBranch({
    repo,
    branch: fromBranch,
    path,
  });
  
  // Build from second branch
  const toBuild = await buildFromBranch({
    repo,
    branch: toBranch,
    path,
  });
  
  // Generate diff
  const diff = formatYamlDiff(fromBuild, toBuild, fromBranch, toBranch);
  return diff;
}

async function buildFromBranch(options: {
  repo: string;
  branch: string;
  path: string;
}): Promise<string> {
  const { repo, branch, path } = options;
  const tempDir = await mkdtemp(join(tmpdir(), "kzdiff-branch-"));

  try {
    // Clone the repository with specific branch
    await Bun.$`git clone --depth 1 --branch ${branch} ${repo} ${tempDir}`.quiet();
    
    // Find kustomize
    const kustomizePath = await findKustomize();
    
    // Run kustomize build
    const targetPath = join(tempDir, path);
    const result = await Bun.$`cd ${targetPath} && ${kustomizePath} build .`.text();
    
    return result;
  } finally {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function findKustomize(): Promise<string> {
  try {
    const which = await Bun.$`which kustomize`.text();
    return which.trim();
  } catch {
    const misePath = "/Users/shoppingjaws/.local/share/mise/installs/kustomize/5.7.0/kustomize";
    const { existsSync } = await import("node:fs");
    if (existsSync(misePath)) {
      return misePath;
    }
    throw new Error("kustomize not found. Please install kustomize.");
  }
}

// Test
async function main() {
  try {
    const diff = await compareRemoteBranches({
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      path: "/examples/helloWorld",
      fromBranch: "kustomize/v5.5.0",  // Older version
      toBranch: "kustomize/v5.7.0",     // Newer version
    });
    
    console.log("\n=== Diff Output ===");
    console.log(diff);
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.main) {
  main();
}

export { compareRemoteBranches, buildFromBranch };