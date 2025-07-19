import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { kzdiff } from "./kzdiff";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "tests", "fixtures");
const kustomizePath = "/Users/shoppingjaws/.local/share/mise/installs/kustomize/5.7.0/kustomize";

let testDir: string;
let gitRepo: string;

beforeEach(async () => {
  // Create git repository for testing
  gitRepo = await mkdtemp(join(tmpdir(), "kzdiff-git-"));
  await Bun.$`cd ${gitRepo} && git init`.quiet();
  await Bun.$`cd ${gitRepo} && git config user.email "test@example.com"`.quiet();
  await Bun.$`cd ${gitRepo} && git config user.name "Test User"`.quiet();
});

afterEach(async () => {
  // Cleanup
  if (testDir) await rm(testDir, { recursive: true, force: true });
  if (gitRepo) await rm(gitRepo, { recursive: true, force: true });
});

test("kzdiff should compare kustomize build results between default branch and current changes", async () => {
  // Setup test directory structure by copying from fixtures
  testDir = await mkdtemp(join(tmpdir(), "kzdiff-test-basic-"));
  const fixtureTestCase = join(fixturesDir, "test-case-basic");
  await cp(fixtureTestCase, testDir, { recursive: true });

  // Verify the test setup works correctly
  const fromResult = await readFile(join(testDir, "from", "result", "build.yaml"), "utf-8");
  const toResult = await readFile(join(testDir, "to", "result", "build.yaml"), "utf-8");

  expect(fromResult).toContain("nginx:1.14");
  expect(fromResult).toContain("replicas: 1");
  expect(toResult).toContain("nginx:1.20");
  expect(toResult).toContain("replicas: 2");
  expect(toResult).toContain("ENV");
  expect(toResult).toContain("production");

  // Test kzdiff function
  const diff = await kzdiff(join(testDir, "from", "git", "base"), { tmpDir: testDir });
  expect(diff).toBeDefined();
  expect(diff).toContain("nginx:1.14");
  expect(diff).toContain("nginx:1.20");
});

test("kzdiff should handle overlays correctly", async () => {
  // Setup test directory structure by copying from fixtures
  testDir = await mkdtemp(join(tmpdir(), "kzdiff-test-overlay-"));
  const fixtureTestCase = join(fixturesDir, "test-case-overlay");
  await cp(fixtureTestCase, testDir, { recursive: true });

  // Verify overlay differences
  const fromResult = await readFile(join(testDir, "from", "result", "build.yaml"), "utf-8");
  const toResult = await readFile(join(testDir, "to", "result", "build.yaml"), "utf-8");

  expect(fromResult).toContain("replicas: 3");
  expect(toResult).toContain("replicas: 5");
  expect(toResult).toContain("memory: 512Mi");
  expect(toResult).toContain("cpu: 500m");

  // Test kzdiff function with overlay
  const diff = await kzdiff(join(testDir, "from", "git", "overlays", "production"), { tmpDir: testDir });
  expect(diff).toBeDefined();
  expect(diff).toContain("replicas: 3");
  expect(diff).toContain("replicas: 5");
});

test("kzdiff should handle errors gracefully", async () => {
  // Test non-kustomize directory
  const nonKustomizeDir = join(gitRepo, "not-kustomize");
  await mkdir(nonKustomizeDir, { recursive: true });
  
  // Running kustomize build should fail
  try {
    await kzdiff(nonKustomizeDir);
    expect(true).toBe(false); // Should not reach here
  } catch (error: any) {
    expect(error).toBeDefined();
    expect(error.message).toContain("kustomization.yaml");
  }

  // Test non-git directory
  const nonGitDir = await mkdtemp(join(tmpdir(), "not-git-"));
  await mkdir(join(nonGitDir, "base"), { recursive: true });
  
  await Bun.write(join(nonGitDir, "base", "kustomization.yaml"), `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
`);

  // Git operations should fail
  try {
    await kzdiff(join(nonGitDir, "base"));
    expect(true).toBe(false); // Should not reach here
  } catch (error: any) {
    expect(error).toBeDefined();
    expect(error.message).toContain("git");
  } finally {
    await rm(nonGitDir, { recursive: true, force: true });
  }
});