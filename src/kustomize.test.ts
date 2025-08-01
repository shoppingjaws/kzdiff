import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { kustomizeBuildToTmp } from "./kustomize";

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
});