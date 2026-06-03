import { $ } from "bun"
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDebugLogger } from "./debug"

interface ErrorWithStderr extends Error {
	stderr?: string | Buffer
}

interface BuildOptions {
	ref?: string
	remote?: string
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function cloneRemoteRef(remote: string, ref: string): Promise<string> {
	const debug = createDebugLogger("cloneRemoteRef")
	const cleanRemote = remote.replace(/\.git$/, "")
	const cloneDir = await mkdtemp(join(tmpdir(), "kzdiff-clone-"))

	debug(`Cloning ${cleanRemote} @ ${ref} into ${cloneDir}`)

	await $`git init --quiet ${cloneDir}`.quiet()
	await $`git -C ${cloneDir} remote add origin ${cleanRemote}`.quiet()
	await $`git -C ${cloneDir} fetch --depth=1 origin ${ref}`.quiet()
	await $`git -C ${cloneDir} checkout --quiet FETCH_HEAD`.quiet()

	return cloneDir
}

export async function kustomizeBuildToTmp(
	kustomizePath: string,
	filename: "before.yaml" | "after.yaml",
	options?: string[],
	buildOptions?: BuildOptions,
): Promise<string> {
	const debug = createDebugLogger("kustomizeBuildToTmp")
	const tempDir = await mkdtemp(join(tmpdir(), "kustomize-build-"))
	const outputPath = join(tempDir, filename)

	debug(`Created temp dir: ${tempDir}`)
	debug(`Output path: ${outputPath}`)

	let targetPath = kustomizePath

	try {
		// Clone the remote ref locally so kustomize flags such as
		// --load-restrictor=LoadRestrictionsNone apply. Kustomize's native
		// remote-URL fetcher forces LoadRestrictionsRootOnly regardless of flags.
		if (buildOptions?.remote && buildOptions?.ref) {
			const cloneDir = await cloneRemoteRef(buildOptions.remote, buildOptions.ref)
			const cleanPath = kustomizePath.replace(/^\.?\//, "")
			const localTarget = join(cloneDir, cleanPath)

			if (!(await pathExists(localTarget))) {
				debug(`Path ${cleanPath} not found in ${buildOptions.ref}, returning empty file`)
				await Bun.write(outputPath, "")
				return outputPath
			}

			targetPath = localTarget
			debug(`Using cloned local path: ${targetPath}`)
		} else {
			debug(`Using local path: ${targetPath}`)
		}

		const args = ["kustomize", "build"]

		if (options && options.length > 0) {
			args.push(...options)
			debug(`Additional options: ${options.join(" ")}`)
		}

		args.push(targetPath)

		debug(`Running command: ${args.join(" ")}`)

		const result = await $`${args}`.quiet()
		await Bun.write(outputPath, result.stdout)

		debug(`Build successful, wrote ${result.stdout.length} bytes to ${outputPath}`)

		return outputPath
	} catch (error) {
		console.error(`[kustomizeBuildToTmp] Error: ${error}`)
		if (error instanceof Error && "stderr" in error) {
			const errorWithStderr = error as ErrorWithStderr
			if (errorWithStderr.stderr) {
				console.error(`[kustomizeBuildToTmp] stderr: ${errorWithStderr.stderr}`)
			}
		}
		throw new Error(`Failed to run kustomize build: ${error}`)
	}
}
