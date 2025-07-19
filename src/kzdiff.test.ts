import { test, expect, beforeEach, afterEach, describe } from "bun:test";
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

// Helper function to run fixture-based tests
interface TestCase {
  name: string;
  fixtureName: string;
  targetPath?: string; // Optional: path within the fixture to use as targetDir for kzdiff
  expectations: {
    from: string[];
    to: string[];
    diff?: string[];
  };
}

async function runFixtureTest(testCase: TestCase) {
  // Setup test directory structure by copying from fixtures
  testDir = await mkdtemp(join(tmpdir(), `kzdiff-test-${testCase.fixtureName}-`));
  const fixtureTestCase = join(fixturesDir, testCase.fixtureName);
  await cp(fixtureTestCase, testDir, { recursive: true });

  // Verify the test setup works correctly
  const fromResult = await readFile(join(testDir, "from", "result", "build.yaml"), "utf-8");
  const toResult = await readFile(join(testDir, "to", "result", "build.yaml"), "utf-8");

  // Check expectations for 'from' result
  for (const expectation of testCase.expectations.from) {
    expect(fromResult).toContain(expectation);
  }

  // Check expectations for 'to' result
  for (const expectation of testCase.expectations.to) {
    expect(toResult).toContain(expectation);
  }

  // Test kzdiff function
  const targetDir = testCase.targetPath || testDir;
  const diff = await kzdiff(targetDir, { tmpDir: testDir });
  expect(diff).toBeDefined();

  // Check diff expectations if provided
  if (testCase.expectations.diff) {
    for (const expectation of testCase.expectations.diff) {
      expect(diff).toContain(expectation);
    }
  }
}

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

// Define test cases
const testCases: TestCase[] = [
  {
    name: "kzdiff should compare kustomize build results between default branch and current changes",
    fixtureName: "test-case-basic",
    expectations: {
      from: ["nginx:1.14", "replicas: 1"],
      to: ["nginx:1.20", "replicas: 2", "ENV", "production"],
      diff: ["nginx:1.14", "nginx:1.20"]
    }
  },
  {
    name: "kzdiff should handle overlays correctly",
    fixtureName: "test-case-overlay",
    expectations: {
      from: ["replicas: 3"],
      to: ["replicas: 5", "memory: 512Mi", "cpu: 500m"],
      diff: ["replicas: 3", "replicas: 5"]
    }
  }
];

// Run tests using the generalized function
for (const testCase of testCases) {
  test(testCase.name, async () => {
    await runFixtureTest(testCase);
  });
}

// Error test cases
describe("Error handling", () => {
  test("should fail when kustomization.yaml is missing", async () => {
    const nonKustomizeDir = join(gitRepo, "not-kustomize");
    await mkdir(nonKustomizeDir, { recursive: true });
    
    await expect(kzdiff(nonKustomizeDir)).rejects.toThrow("kustomization.yaml");
  });

  test("should fail when not in a git repository", async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), "not-git-"));
    try {
      await mkdir(join(nonGitDir, "base"), { recursive: true });
      await Bun.write(join(nonGitDir, "base", "kustomization.yaml"), `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
`);

      await expect(kzdiff(join(nonGitDir, "base"))).rejects.toThrow("git");
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });
});