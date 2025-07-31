import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function findKustomize(): Promise<string> {
  try {
    const which = await Bun.$`which kustomize`.text();
    return which.trim();
  } catch {
    const paths = [
      "/usr/local/bin/kustomize",
      "/opt/homebrew/bin/kustomize",
      `${process.env.HOME}/.local/bin/kustomize`,
    ];
    
    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    throw new Error("kustomize not found. Please install kustomize: https://kubectl.docs.kubernetes.io/installation/kustomize/");
  }
}

export async function createTempDir(prefix: string = "kzdiff-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function checkGitRepository(dir: string): Promise<void> {
  try {
    await Bun.$`cd ${dir} && git rev-parse --git-dir`.quiet();
  } catch {
    throw new Error(`${dir} is not in a git repository`);
  }
}

export async function checkKustomizationExists(dir: string): Promise<void> {
  const kustomizationPath = join(dir, "kustomization.yaml");
  if (!existsSync(kustomizationPath)) {
    throw new Error(`No kustomization.yaml found in ${dir}`);
  }
}

export async function buildKustomize(dir: string): Promise<string> {
  const kustomizePath = await findKustomize();
  return await Bun.$`cd ${dir} && ${kustomizePath} build .`.text();
}

export interface GitState {
  currentBranch: string;
  hasChanges: boolean;
  needsStash: boolean;
}

export async function getGitState(dir: string): Promise<GitState> {
  const currentBranch = await Bun.$`cd ${dir} && git branch --show-current`.text();
  const hasChanges = await Bun.$`cd ${dir} && git status --porcelain`.text();
  const needsStash = hasChanges.trim().length > 0;
  
  return {
    currentBranch: currentBranch.trim(),
    hasChanges: needsStash,
    needsStash,
  };
}

export async function stashChanges(dir: string): Promise<void> {
  await Bun.$`cd ${dir} && git stash push -m "kzdiff temporary stash"`.quiet();
}

export async function restoreStash(dir: string): Promise<void> {
  const stashList = await Bun.$`cd ${dir} && git stash list`.text();
  if (stashList.includes("kzdiff temporary stash")) {
    await Bun.$`cd ${dir} && git stash pop`.quiet();
  }
}

export async function checkoutBranch(dir: string, branch: string): Promise<void> {
  await Bun.$`cd ${dir} && git checkout ${branch}`.quiet();
}

export async function getGitRoot(dir: string): Promise<string> {
  const gitRoot = await Bun.$`cd ${dir} && git rev-parse --show-toplevel`.text();
  return gitRoot.trim();
}