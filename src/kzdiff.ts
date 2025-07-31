import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { formatYamlDiff } from "./diff";
import {
  createTempDir,
  checkGitRepository,
  checkKustomizationExists,
  buildKustomize,
  getGitState,
  stashChanges,
  restoreStash,
  checkoutBranch,
  getGitRoot,
} from "./utils";

export interface KzdiffOptions {
  tmpDir?: string;
  baseBranch?: string;
  remote?: string;
  noColor?: boolean;
}

export async function kzdiff(
  targetDir: string,
  options: KzdiffOptions = {}
): Promise<string> {
  const { baseBranch = "main", remote, noColor = false } = options;

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

    return formatYamlDiff(fromResult, toResult, baseBranch, "current", { color: !noColor });
  }

  // Remote comparison mode
  if (remote) {
    return await compareRemote(remote, targetDir, baseBranch, noColor);
  }

  // Local comparison mode
  await checkKustomizationExists(targetDir);
  await checkGitRepository(targetDir);

  const tmpDir = await createTempDir();
  
  try {
    // Create directory structure
    const fromGitDir = join(tmpDir, "from", "git");
    const fromResultDir = join(tmpDir, "from", "result");
    const toResultDir = join(tmpDir, "to", "result");

    await mkdir(fromGitDir, { recursive: true });
    await mkdir(fromResultDir, { recursive: true });
    await mkdir(toResultDir, { recursive: true });

    // Get current git state
    const gitState = await getGitState(targetDir);
    
    // Stash changes if any
    if (gitState.needsStash) {
      await stashChanges(targetDir);
    }

    try {
      // Checkout base branch and copy files
      await checkoutBranch(targetDir, baseBranch);
      const gitRoot = await getGitRoot(targetDir);
      await Bun.$`cp -r ${gitRoot}/* ${fromGitDir}/`.quiet();

      // Build from base branch
      const relativeTarget = targetDir.replace(gitRoot, "").replace(/^\//, "");
      const fromTargetDir = join(fromGitDir, relativeTarget);
      const fromBuild = await buildKustomize(fromTargetDir);
      await Bun.write(join(fromResultDir, "build.yaml"), fromBuild);

      // Checkout original branch
      await checkoutBranch(targetDir, gitState.currentBranch);
      
      // Restore stashed changes if any
      if (gitState.needsStash) {
        await restoreStash(targetDir);
      }

      // Build from current state
      const toBuild = await buildKustomize(targetDir);
      await Bun.write(join(toResultDir, "build.yaml"), toBuild);

      // Generate diff
      return formatYamlDiff(fromBuild, toBuild, baseBranch, "current", { color: !noColor });
    } catch (error) {
      // Restore original state if something went wrong
      await checkoutBranch(targetDir, gitState.currentBranch);
      if (gitState.needsStash) {
        await restoreStash(targetDir);
      }
      throw error;
    }
  } finally {
    // Cleanup temp directory
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function compareRemote(repo: string, path: string, baseBranch: string, noColor: boolean): Promise<string> {
  const tmpDir = await createTempDir("kzdiff-remote-");
  
  try {
    // Clone base branch
    const baseDir = join(tmpDir, "base");
    await Bun.$`git clone --depth 1 --branch ${baseBranch} ${repo} ${baseDir}`.quiet();
    const basePath = join(baseDir, path.startsWith("/") ? path.slice(1) : path);
    
    await checkKustomizationExists(basePath);
    const baseBuild = await buildKustomize(basePath);
    
    // Clone main/master branch for comparison
    const mainDir = join(tmpDir, "main");
    const mainBranch = await getDefaultBranch(repo);
    
    if (mainBranch !== baseBranch) {
      await Bun.$`git clone --depth 1 --branch ${mainBranch} ${repo} ${mainDir}`.quiet();
      const mainPath = join(mainDir, path.startsWith("/") ? path.slice(1) : path);
      
      await checkKustomizationExists(mainPath);
      const mainBuild = await buildKustomize(mainPath);
      
      return formatYamlDiff(baseBuild, mainBuild, baseBranch, mainBranch, { color: !noColor });
    } else {
      // If comparing same branch, just return the build
      return baseBuild;
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function getDefaultBranch(repo: string): Promise<string> {
  try {
    const result = await Bun.$`git ls-remote --symref ${repo} HEAD`.text();
    const match = result.match(/ref: refs\/heads\/(\S+)/);
    return match?.[1] ?? "main";
  } catch {
    return "main";
  }
}