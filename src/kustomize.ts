import { $ } from "bun"
import { mkdtemp } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { tmpdir } from "node:os"
import { createDebugLogger } from "./debug"

interface ErrorWithStderr extends Error {
	stderr?: string | Buffer
}

type RemoteBuildOptions = {
        mode: "remote"
        ref?: string
        remote: string
        repoRoot: string
}

type LocalBuildOptions = {
        mode: "local"
        ref: string
        repoRoot: string
}

type BuildOptions = RemoteBuildOptions | LocalBuildOptions

function ensureRepoRelativePath(targetPath: string, repoRoot: string): string {
        const absoluteTargetPath = resolve(targetPath)
        const absoluteRepoRoot = resolve(repoRoot)
        const relativePath = relative(absoluteRepoRoot, absoluteTargetPath)

        if (relativePath.startsWith("..")) {
                throw new Error(
                        `[kustomizeBuildToTmp] The provided path ${targetPath} is outside of the repository root ${repoRoot}`,
                )
        }

        if (relativePath === "") {
                return "."
        }

        return relativePath
}

function toRemoteRelativePath(repoRelativePath: string): string {
        const normalized = repoRelativePath.split(sep).join("/")

        if (normalized === "." || normalized === "") {
                return ""
        }

        return normalized.replace(/^(\.\/)+/, "").replace(/^\/+/g, "")
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

        const resolvedKustomizePath = resolve(kustomizePath)
        let targetPath = resolvedKustomizePath
        let worktreePath: string | null = null

        debug(`Resolved kustomize path: ${resolvedKustomizePath}`)

        try {
                if (buildOptions?.mode === "remote") {
                        const repoRelativePath = ensureRepoRelativePath(resolvedKustomizePath, buildOptions.repoRoot)
                        const cleanRemote = buildOptions.remote.replace(/\.git$/, "")
                        const remoteRelativePath = toRemoteRelativePath(repoRelativePath)
                        const remotePathSuffix = remoteRelativePath.length > 0 ? `//${remoteRelativePath}` : "//"
                        targetPath = `${cleanRemote}${remotePathSuffix}`

                        const queryParams = []
                        if (buildOptions.ref) {
                                queryParams.push(`ref=${buildOptions.ref}`)
                        }
                        queryParams.push("submodules=false")

                        targetPath += `?${queryParams.join("&")}`

                        debug(`Using remote URL: ${targetPath}`)
                } else if (buildOptions?.mode === "local") {
                        const repoRelativePath = ensureRepoRelativePath(resolvedKustomizePath, buildOptions.repoRoot)
                        worktreePath = join(tempDir, "worktree")
                        debug(`Creating git worktree at ${worktreePath} for ref ${buildOptions.ref}`)

                        const worktreeAddResult = await $`git worktree add --force --detach ${worktreePath} ${buildOptions.ref}`
                                .nothrow()
                                .quiet()

                        if (worktreeAddResult.exitCode !== 0) {
                                debug(
                                        `git worktree add --detach failed (exit code ${worktreeAddResult.exitCode}), falling back to regular checkout`,
                                )
                                const fallbackResult = await $`git worktree add --force ${worktreePath} ${buildOptions.ref}`
                                        .nothrow()
                                        .quiet()

                                if (fallbackResult.exitCode !== 0) {
                                        throw new Error(
                                                `git worktree add failed with exit code ${fallbackResult.exitCode}: ${fallbackResult.stderr?.toString() ?? ""}`,
                                        )
                                }
                        }

                        targetPath = resolve(worktreePath, repoRelativePath)
                        debug(`Using local git ref path: ${targetPath}`)
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
                if (buildOptions && error instanceof Error && "stderr" in error) {
                        const errorWithStderr = error as ErrorWithStderr
                        if (errorWithStderr.stderr) {
                                const errorMessage = errorWithStderr.stderr.toString().toLowerCase()
                                const notFoundPatterns = ["does not exist", "no such file or directory"]
                                const isNotFound = notFoundPatterns.some((pattern) => errorMessage.includes(pattern))

                                if (isNotFound) {
                                        debug(`Directory not found for ${buildOptions.mode} ref, creating empty file at ${outputPath}`)
                                        await Bun.write(outputPath, "")
                                        return outputPath
                                }
                        }
                }

                console.error(`[kustomizeBuildToTmp] Error: ${error}`)
                if (error instanceof Error && "stderr" in error) {
                        const errorWithStderr = error as ErrorWithStderr
                        if (errorWithStderr.stderr) {
                                console.error(`[kustomizeBuildToTmp] stderr: ${errorWithStderr.stderr}`)
                        }
                }
                throw new Error(`Failed to run kustomize build: ${error}`)
        } finally {
                if (buildOptions?.mode === "local" && worktreePath) {
                        try {
                                debug(`Removing git worktree: ${worktreePath}`)
                                await $`git worktree remove --force ${worktreePath}`.quiet()
                        } catch (cleanupError) {
                                debug(`Failed to remove git worktree ${worktreePath}: ${cleanupError}`)
                        }
                }
        }
}
