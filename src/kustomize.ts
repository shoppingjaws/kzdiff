import { $ } from "bun";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDebugLogger } from "./debug";

interface BuildOptions {
	ref?: string;
	remote?: string;
}

export async function kustomizeBuildToTmp(
	kustomizePath: string,
	filename: "before.yaml" | "after.yaml",
	options?: string[],
	buildOptions?: BuildOptions,
): Promise<string> {
	const debug = createDebugLogger("kustomizeBuildToTmp");
	const tempDir = await mkdtemp(join(tmpdir(), "kustomize-build-"));
	const outputPath = join(tempDir, filename);

	debug(`Created temp dir: ${tempDir}`);
	debug(`Output path: ${outputPath}`);

	let targetPath = kustomizePath;

	try {
		// If remote is specified, use Kustomize's native remote support
		if (buildOptions?.remote) {
			// Format: https://github.com/owner/repo//path/to/dir?ref=branch
			const cleanRemote = buildOptions.remote.replace(/\.git$/, "");
			const cleanPath = kustomizePath.replace(/^\.?\//, "");
			targetPath = `${cleanRemote}//${cleanPath}`;

			if (buildOptions.ref) {
				targetPath += `?ref=${buildOptions.ref}`;
			}

			debug(`Using remote URL: ${targetPath}`);
		} else {
			debug(`Using local path: ${targetPath}`);
		}

		const args = ["kustomize", "build"];

		if (options && options.length > 0) {
			args.push(...options);
			debug(`Additional options: ${options.join(" ")}`);
		}

		args.push(targetPath);

		debug(`Running command: ${args.join(" ")}`);

		const result = await $`${args}`.quiet();
		await writeFile(outputPath, result.stdout);

		debug(
			`Build successful, wrote ${result.stdout.length} bytes to ${outputPath}`,
		);

		return outputPath;
	} catch (error: any) {
		console.error(`[kustomizeBuildToTmp] Error: ${error}`);
		if (error.stderr) {
			console.error(`[kustomizeBuildToTmp] stderr: ${error.stderr}`);
		}
		throw new Error(`Failed to run kustomize build: ${error}`);
	}
}
