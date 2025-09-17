import { $ } from "bun"
import { pathToFileURL } from "node:url"

export const TEST_MAIN_COMMIT = "3b4d8b0121ac84d7678591d8139b6eb5f88061d6"

export async function ensureLocalGitRemoteForTests(branchCommit: string, branchName: string = "main"): Promise<string> {
	const repoRootResult = await $`git rev-parse --show-toplevel`.quiet().nothrow()
	if (repoRootResult.exitCode !== 0) {
		throw new Error("Failed to determine git repository root for tests")
	}

	const repoRoot = repoRootResult.stdout.toString().trim()
	const remoteUrl = pathToFileURL(repoRoot).toString()

	const setRemoteResult = await $`git remote set-url origin ${remoteUrl}`.quiet().nothrow()
	if (setRemoteResult.exitCode !== 0) {
		await $`git remote add origin ${remoteUrl}`.quiet()
	}

	if (branchName) {
		await $`git branch --force ${branchName} ${branchCommit}`.quiet()
	}

	return remoteUrl
}
