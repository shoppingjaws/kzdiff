import { $ } from "bun";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

interface BuildOptions {
  ref?: string;
  remote?: string;
}

export async function kustomizeBuildToTmp(
  kustomizePath: string,
  filename: "before.yaml" | "after.yaml",
  options?: string[],
  buildOptions?: BuildOptions
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "kustomize-build-"));
  const outputPath = join(tempDir, filename);
  
  let targetPath = kustomizePath;
  
  try {
    // If remote is specified, use Kustomize's native remote support
    if (buildOptions?.remote) {
      // Format: https://github.com/owner/repo//path/to/dir?ref=branch
      const cleanRemote = buildOptions.remote.replace(/\.git$/, '');
      const cleanPath = kustomizePath.replace(/^\//, '');
      targetPath = `${cleanRemote}//${cleanPath}`;
      
      if (buildOptions.ref) {
        targetPath += `?ref=${buildOptions.ref}`;
      }
    }
    
    const args = ["kustomize", "build"];
    
    if (options && options.length > 0) {
      args.push(...options);
    }
    
    args.push(targetPath);
    
    const result = await $`${args}`.quiet();
    await writeFile(outputPath, result.stdout);
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to run kustomize build: ${error}`);
  }
}