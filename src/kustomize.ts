import { $ } from "bun";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function kustomizeBuildToTmp(
  kustomizePath: string,
  filename: "before.yaml" | "after.yaml",
  options?: string[]
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "kustomize-build-"));
  const outputPath = join(tempDir, filename);
  
  try {
    const args = ["kustomize", "build"];
    
    if (options && options.length > 0) {
      args.push(...options);
    }
    
    args.push(kustomizePath);
    
    const result = await $`${args}`.quiet();
    await writeFile(outputPath, result.stdout);
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to run kustomize build: ${error}`);
  }
}