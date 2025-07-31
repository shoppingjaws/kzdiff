#!/usr/bin/env bun

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RemoteBuildOptions {
  repo: string;
  branch: string;
  path: string;
}

async function buildFromRemote(options: RemoteBuildOptions): Promise<string> {
  const { repo, branch, path } = options;
  const tempDir = await mkdtemp(join(tmpdir(), "kzdiff-remote-"));

  try {
    console.log(`Cloning ${repo} (branch: ${branch})...`);
    
    // Clone the repository with specific branch
    await Bun.$`git clone --depth 1 --branch ${branch} ${repo} ${tempDir}`.quiet();
    
    // Find kustomize
    const kustomizePath = await findKustomize();
    
    // Run kustomize build
    const targetPath = join(tempDir, path);
    console.log(`Building from ${targetPath}...`);
    
    const result = await Bun.$`cd ${targetPath} && ${kustomizePath} build .`.text();
    
    console.log("Build successful!");
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
    // Try mise installation
    const misePath = "/Users/shoppingjaws/.local/share/mise/installs/kustomize/5.7.0/kustomize";
    const { existsSync } = await import("node:fs");
    if (existsSync(misePath)) {
      return misePath;
    }
    throw new Error("kustomize not found. Please install kustomize.");
  }
}

// Test with kubernetes-sigs/kustomize examples
async function main() {
  const testCases = [
    {
      name: "Hello World Base",
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      branch: "master",
      path: "examples/helloWorld",
    },
    {
      name: "Hello World Staging",
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      branch: "master",
      path: "examples/helloWorld/overlays/staging",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    try {
      const result = await buildFromRemote(testCase);
      console.log("\nBuild result:");
      console.log(result.substring(0, 500) + "..."); // Show first 500 chars
    } catch (error) {
      console.error(`Failed: ${error}`);
    }
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { buildFromRemote, findKustomize };