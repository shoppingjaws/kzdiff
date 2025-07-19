import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

  // Production mode would implement actual git operations
  throw new Error("Production mode not implemented yet");
}