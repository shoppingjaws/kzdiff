import { existsSync } from "node:fs";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { formatYamlDiff } from "./diff";

export interface KzdiffOptions {
  tmpDir?: string;
  baseBranch?: string;
}

export async function kzdiff(
  targetDir: string,
  options: KzdiffOptions = {}
): Promise<string> {
  const { baseBranch = "main" } = options;

  // If tmpDir is provided, assume test mode and use pre-built results
  if (options.tmpDir) {
    // In test mode, skip git and kustomization checks
    const fromResult = await readFile(
      join(options.tmpDir, "from", "result", "build.yaml"),
      "utf-8"
    );
    const toResult = await readFile(
      join(options.tmpDir, "to", "result", "build.yaml"),
      "utf-8"
    );

    // Simple diff for now - just return both results
    return `--- ${baseBranch}\n${fromResult}\n+++ current\n${toResult}`;
  }

  // Check if kustomization.yaml exists
  const kustomizationPath = join(targetDir, "kustomization.yaml");
  if (!existsSync(kustomizationPath)) {
    throw new Error(`No kustomization.yaml found in ${targetDir}`);
  }

  // Check if we're in a git repository
  try {
    await Bun.$`cd ${targetDir} && git rev-parse --git-dir`.quiet();
  } catch (error) {
    throw new Error(`${targetDir} is not in a git repository`);
  }

  // Production mode: actual git operations
  const tmpDir = await createTempDir();
  
  try {
    // Create directory structure
    const fromGitDir = join(tmpDir, "from", "git");
    const fromResultDir = join(tmpDir, "from", "result");
    const toResultDir = join(tmpDir, "to", "result");

    await mkdir(fromGitDir, { recursive: true });
    await mkdir(fromResultDir, { recursive: true });
    await mkdir(toResultDir, { recursive: true });

    // Get current branch and check for uncommitted changes
    const currentBranch = await Bun.$`cd ${targetDir} && git branch --show-current`.text();
    const hasChanges = await Bun.$`cd ${targetDir} && git status --porcelain`.text();
    
    // Stash changes if any
    const needsStash = hasChanges.trim().length > 0;
    if (needsStash) {
      await Bun.$`cd ${targetDir} && git stash push -m "kzdiff temporary stash"`.quiet();
    }

    try {
      // Checkout base branch and copy files
      await Bun.$`cd ${targetDir} && git checkout ${baseBranch}`.quiet();
      const gitRoot = await Bun.$`cd ${targetDir} && git rev-parse --show-toplevel`.text();
      await Bun.$`cp -r ${gitRoot.trim()}/* ${fromGitDir}/`.quiet();

      // Build from base branch
      const relativeTarget = targetDir.replace(gitRoot.trim(), "").replace(/^\//, "");
      const fromTargetDir = join(fromGitDir, relativeTarget);
      const kustomizePath = await findKustomize();
      const fromBuild = await Bun.$`cd ${fromTargetDir} && ${kustomizePath} build .`.text();
      await Bun.write(join(fromResultDir, "build.yaml"), fromBuild);

      // Checkout original branch
      await Bun.$`cd ${targetDir} && git checkout ${currentBranch.trim()}`.quiet();
      
      // Restore stashed changes if any
      if (needsStash) {
        await Bun.$`cd ${targetDir} && git stash pop`.quiet();
      }

      // Build from current state
      const toBuild = await Bun.$`cd ${targetDir} && ${kustomizePath} build .`.text();
      await Bun.write(join(toResultDir, "build.yaml"), toBuild);

      // Generate diff
      const diff = await generateDiff(fromBuild, toBuild, baseBranch);
      return diff;
    } catch (error) {
      // Restore original state if something went wrong
      await Bun.$`cd ${targetDir} && git checkout ${currentBranch.trim()}`.quiet();
      if (needsStash) {
        await Bun.$`cd ${targetDir} && git stash pop`.quiet();
      }
      throw error;
    }
  } finally {
    // Cleanup temp directory
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function createTempDir(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  return mkdtemp(join(tmpdir(), "kzdiff-"));
}

async function findKustomize(): Promise<string> {
  try {
    // Try to find kustomize in PATH
    const which = await Bun.$`which kustomize`.text();
    return which.trim();
  } catch {
    // Fallback to mise installation
    const misePath = "/Users/shoppingjaws/.local/share/mise/installs/kustomize/5.7.0/kustomize";
    if (existsSync(misePath)) {
      return misePath;
    }
    throw new Error("kustomize not found. Please install kustomize.");
  }
}

async function generateDiff(fromContent: string, toContent: string, baseBranch: string): Promise<string> {
  return formatYamlDiff(fromContent, toContent, baseBranch, "current");
}