import { $ } from "bun";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDebugLogger } from "./debug";

interface ErrorWithStderr extends Error {
	stderr?: string | Buffer;
}

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
			// Format: https://github.com/owner/repo//path/to/dir?ref=branch&submodules=false
			const cleanRemote = buildOptions.remote.replace(/\.git$/, "");
			const cleanPath = kustomizePath.replace(/^\.?\//, "");
			targetPath = `${cleanRemote}//${cleanPath}`;

			// Add query parameters
			const queryParams = [];
			if (buildOptions.ref) {
				queryParams.push(`ref=${buildOptions.ref}`);
			}
			queryParams.push("submodules=false");

			targetPath += `?${queryParams.join("&")}`;

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
		await Bun.write(outputPath, result.stdout);

		debug(
			`Build successful, wrote ${result.stdout.length} bytes to ${outputPath}`,
		);

		return outputPath;
	} catch (error) {
		// Check if this is a remote build and the directory doesn't exist
		if (buildOptions?.remote && error instanceof Error && 'stderr' in error) {
			const errorWithStderr = error as ErrorWithStderr;
			if (errorWithStderr.stderr) {
				const errorMessage = errorWithStderr.stderr.toString().toLowerCase();
				const notFoundPatterns = ["does not exist", "no such file or directory"];

				const isNotFound = notFoundPatterns.some((pattern) =>
					errorMessage.includes(pattern),
				);

				if (isNotFound) {
					debug(
						`Remote directory not found, creating empty file at ${outputPath}`,
					);
					await Bun.write(outputPath, "");
					return outputPath;
				}
			}
		}

		console.error(`[kustomizeBuildToTmp] Error: ${error}`);
		if (error.stderr) {
			console.error(`[kustomizeBuildToTmp] stderr: ${error.stderr}`);
		}
		throw new Error(`Failed to run kustomize build: ${error}`);
	}
}
