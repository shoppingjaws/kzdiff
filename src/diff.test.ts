import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { showDiff } from "./diff";

describe("showDiff", () => {
  let tempDir: string;
  let file1: string;
  let file2: string;
  
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "diff-test-"));
    file1 = join(tempDir, "file1.yaml");
    file2 = join(tempDir, "file2.yaml");
  });
  
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
  
  test("should show no differences for identical files", async () => {
    const content = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80`;
    
    await writeFile(file1, content);
    await writeFile(file2, content);
    
    // Capture console output
    const originalLog = console.log;
    let output = "";
    console.log = (msg: string) => { output += msg + "\n"; };
    
    try {
      await showDiff(file1, file2);
      expect(output).toContain("No differences found");
    } finally {
      console.log = originalLog;
    }
  });
  
  test("should show differences between files", async () => {
    const content1 = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80`;
    
    const content2 = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 8080`;
    
    await writeFile(file1, content1);
    await writeFile(file2, content2);
    
    // Capture console output
    const originalLog = console.log;
    let output = "";
    console.log = (msg: string) => { output += msg + "\n"; };
    
    try {
      await showDiff(file1, file2, { tool: "diff", color: false });
      expect(output).toContain("-  - port: 80");
      expect(output).toContain("+  - port: 8080");
    } finally {
      console.log = originalLog;
    }
  });
  
  test("should handle different diff tools", async () => {
    const content1 = "line1\nline2\nline3";
    const content2 = "line1\nmodified\nline3";
    
    await writeFile(file1, content1);
    await writeFile(file2, content2);
    
    // Test with git-diff
    const originalLog = console.log;
    let output = "";
    console.log = (msg: string) => { output += msg + "\n"; };
    
    try {
      await showDiff(file1, file2, { tool: "git-diff", color: false });
      expect(output).toContain("line2");
      expect(output).toContain("modified");
    } finally {
      console.log = originalLog;
    }
  });
  
  test("should fallback gracefully when tools are not available", async () => {
    await writeFile(file1, "content1");
    await writeFile(file2, "content2");
    
    // Test with a tool that might not be available
    const originalLog = console.log;
    const originalError = console.error;
    let output = "";
    let errorOutput = "";
    console.log = (msg: string) => { output += msg + "\n"; };
    console.error = (msg: string) => { errorOutput += msg + "\n"; };
    
    try {
      // This should fallback to showing file contents or using basic diff
      await showDiff(file1, file2, { tool: "delta" });
      // Should either show diff or fallback content
      expect(output + errorOutput).toBeTruthy();
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });
});