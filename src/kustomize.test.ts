import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { kustomizeBuildToTmp } from "./kustomize";
import { $ } from "bun";

// Test comment to trigger hook
describe("kustomizeBuildToTmp", () => {
  test("should build kustomize and save as before.yaml", async () => {
    const kustomizePath = join(process.cwd(), "examples/overlays/prod");
    const outputPath = await kustomizeBuildToTmp(kustomizePath, "before.yaml");
    
    // Check if file exists
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    
    // Check if file has content
    const content = await readFile(outputPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("apiVersion:");
    
    // Check if filename is correct
    expect(outputPath).toMatch(/before\.yaml$/);
  });

  test("should build kustomize and save as after.yaml", async () => {
    const kustomizePath = join(process.cwd(), "examples/overlays/prod");
    const outputPath = await kustomizeBuildToTmp(kustomizePath, "after.yaml");
    
    // Check if file exists
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    
    // Check if file has content
    const content = await readFile(outputPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("apiVersion:");
    
    // Check if filename is correct
    expect(outputPath).toMatch(/after\.yaml$/);
  });

  test("should accept kustomize options", async () => {
    const kustomizePath = join(process.cwd(), "examples/overlays/prod");
    const options = ["--enable-helm"];
    const outputPath = await kustomizeBuildToTmp(kustomizePath, "before.yaml", options);
    
    // Check if file exists
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    
    // Check if file has content
    const content = await readFile(outputPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  test("should throw error for invalid kustomize path", async () => {
    const invalidPath = "/invalid/path/that/does/not/exist";
    
    expect(async () => {
      await kustomizeBuildToTmp(invalidPath, "before.yaml");
    }).toThrow("Failed to run kustomize build:");
  });

  test("should build from remote branch using Kustomize native support", async () => {
    // Get the current remote URL
    const remoteUrl = await $`git config --get remote.origin.url`.text();
    const remote = remoteUrl.trim();
    
    const outputPath = await kustomizeBuildToTmp(
      "examples/overlays/prod",
      "after.yaml",
      undefined,
      { ref: "main", remote }
    );
    
    // Check if file exists
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    
    // Check if file has content
    const content = await readFile(outputPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("apiVersion:");
    
    // Check if filename is correct
    expect(outputPath).toMatch(/after\.yaml$/);
  });

  test("should execute kustomize build command successfully (exit code 0)", async () => {
    const kustomizePath = join(process.cwd(), "examples/overlays/prod");
    
    // This should not throw an error if exit code is 0
    await expect(kustomizeBuildToTmp(kustomizePath, "before.yaml")).resolves.toBeTruthy();
    
    // Also test with options
    await expect(
      kustomizeBuildToTmp(kustomizePath, "after.yaml", ["--enable-helm"])
    ).resolves.toBeTruthy();
    
    // Test direct shell command execution
    const result = await $`kustomize build ${kustomizePath}`.nothrow();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
    // Note: stderr may contain deprecation warnings, which is OK
  });
});