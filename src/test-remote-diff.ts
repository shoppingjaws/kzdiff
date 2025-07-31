#!/usr/bin/env bun

import { compareRemoteBranches } from "./simple-kzdiff";

async function main() {
  console.log("Testing kzdiff with remote repository...\n");

  // Test 1: Compare same branch but different paths (base vs overlay)
  console.log("=== Test 1: Base vs Production Overlay (same branch) ===");
  try {
    // First, let's build each separately to understand the structure
    const { buildFromBranch } = await import("./simple-kzdiff");
    
    console.log("\nBuilding base configuration...");
    const base = await buildFromBranch({
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      branch: "master",
      path: "/examples/springboot/base",
    });
    
    console.log("\nBuilding production overlay...");
    const prod = await buildFromBranch({
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      branch: "master",
      path: "/examples/springboot/overlays/production",
    });
    
    // Now show the diff
    const { formatYamlDiff } = await import("./diff");
    const diff = formatYamlDiff(base, prod, "base", "production");
    
    console.log("\n=== Diff: Base vs Production ===");
    console.log(diff);
  } catch (error) {
    console.error("Test 1 failed:", error);
  }

  // Test 2: Compare different versions of the same path
  console.log("\n\n=== Test 2: Version comparison (v5.5.0 vs v5.7.0) ===");
  try {
    const diff = await compareRemoteBranches({
      repo: "https://github.com/kubernetes-sigs/kustomize.git",
      path: "/examples/helloWorld",
      fromBranch: "kustomize/v5.5.0",
      toBranch: "kustomize/v5.7.0",
    });
    
    console.log(diff);
  } catch (error) {
    console.error("Test 2 failed:", error);
  }
}

if (import.meta.main) {
  main();
}