#!/usr/bin/env bun

import { readFile } from "node:fs/promises"
import { $ } from "bun"
import { resolve } from "node:path"
import { createDebugLogger, setVerbose } from "./debug"
import { filterYaml } from "./filter"
import { kustomizeBuildToTmp } from "./kustomize"
import { yamlDiff } from "./yaml-diff"

const debug = createDebugLogger("kzdiff-cli")

async function main() {
	const args = process.argv.slice(2)

	// Show help function
	const showHelp = (exitCode: number = 0) => {
		const progName = "kzdiff"
		const helpText = `Usage: ${progName} <kustomize-path> [options...]

Options:
  -b, --branch <ref>       Branch, commit, or ref to compare against (remote by default)
  -r, --ref <ref>          Same as -b/--branch (default: auto-detect)
  -f, --filter <expr>      Filter resources using JSONPath expressions (can be specified multiple times)
  -h, --help               Show this help message
  -v, --verbose            Enable verbose debug logging
  --version                Show version number
  --                       Pass remaining arguments to kustomize

Filter expressions (JSONPath):
  Simple shortcuts:
    kind=Deployment        → $[?(@.kind=='Deployment')]
    name=example-app       → $[?(@.metadata.name=='example-app')]
    namespace=prod         → $[?(@.metadata.namespace=='prod')]
  
  Full JSONPath expressions:
    $[?(@.kind=='Service')]
    $[?(@.spec.replicas>2)]
    $[?(@.metadata.labels.team=='platform')]

Examples:
  ${progName} ./examples/overlays/prod
  ${progName} ./examples/overlays/prod -b develop
  ${progName} ./examples/overlays/prod -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13
  ${progName} ./examples/overlays/prod -f kind=Deployment
  ${progName} ./examples/overlays/prod -f kind=Deployment -f kind=Service
  ${progName} ./examples/overlays/prod -- --enable-helm
  ${progName} ./examples/overlays/prod -b staging -- --enable-helm

Note: When using commit hashes, use the full 40-character SHA`

                const localNote = `
Local references:
  • Local branches and commits that aren't pushed are detected automatically
  • Use origin/<branch> to force comparison against the remote branch`

                console.log(`${helpText}\n${localNote}`)
                process.exit(exitCode)
        }

	// Check for version flag
	if (args.includes("--version")) {
		const { version } = await import("../package.json")
		console.log(version)
		process.exit(0)
	}

	// Check for help flag
	if (args.includes("-h") || args.includes("--help")) {
		showHelp(0)
	}

	if (args.length === 0) {
		showHelp(1)
	}

        const kustomizePathArg = args[0] as string // We know args[0] exists after the length check
        const resolvedKustomizePath = resolve(kustomizePathArg)
        let remoteRef: string | null = null
        let requestedRef: string | null = null
        let kustomizeOptions: string[] = []
        let verbose = false
        const filterOptions: string[] = []

	// Parse arguments
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "-b" || args[i] === "--branch" || args[i] === "-r" || args[i] === "--ref") {
			if (i + 1 < args.length && args[i + 1] !== undefined) {
                                remoteRef = args[i + 1] ?? null
                                requestedRef = remoteRef
				i++ // Skip next argument
			} else {
				console.error(`Error: ${args[i]} requires a branch name or commit hash`)
				process.exit(1)
			}
		} else if (args[i] === "-f" || args[i] === "--filter") {
			const nextArg = args[i + 1]
			if (i + 1 < args.length && nextArg !== undefined) {
				filterOptions.push(nextArg)
				i++ // Skip next argument
			} else {
				console.error(`Error: ${args[i]} requires a filter expression`)
				process.exit(1)
			}
		} else if (args[i] === "-v" || args[i] === "--verbose") {
			verbose = true
		} else if (args[i] === "--") {
			// Everything after -- goes to kustomize
			kustomizeOptions = args.slice(i + 1)
			break
		} else {
			console.error(`Error: Unknown option: ${args[i]}`)
			console.error("Use -- to pass options to kustomize")
			process.exit(1)
		}
	}

	// Enable verbose mode if requested
	if (verbose) {
		setVerbose(true)
	}

        debug(`Processing path: ${kustomizePathArg}`)
        if (kustomizeOptions.length > 0) {
                debug(`Kustomize options: ${kustomizeOptions.join(" ")}`)
        }
        if (filterOptions.length > 0) {
                debug(`Filter options: ${filterOptions.join(", ")}`)
	}

	try {
                // Get current git remote (if configured), branch, and repository root
                const remoteResult = await $`git config --get remote.origin.url`.nothrow().quiet()
                const remote = remoteResult.exitCode === 0 ? remoteResult.stdout.toString().trim() : null
                const repoRootResult = await $`git rev-parse --show-toplevel`.text()
                const repoRoot = repoRootResult.trim()
                const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text()
                const branch = currentBranch.trim()

                if (remote) {
                        debug(`Remote: ${remote}`)
                } else {
                        debug("No remote.origin configured; running in local comparison mode")
                }
                debug(`Repository root: ${repoRoot}`)
                debug(`Current branch: ${branch}`)

		// If no remote ref specified, get the default branch
                if (!remoteRef) {
                        debug("No remote ref specified, detecting default branch...")
                        if (remote) {
                                try {
                                        // Try to get the default branch from remote
                                        const defaultBranchResult = await $`git symbolic-ref refs/remotes/origin/HEAD`.text()
                                        remoteRef = defaultBranchResult.trim().replace("refs/remotes/origin/", "")
                                        debug(`Detected default branch: ${remoteRef}`)
                                } catch {
                                        // Fallback: try common default branches on remote
                                        debug("Could not detect default branch from remote, trying common defaults...")
                                        const commonDefaults = ["main", "master"]
                                        for (const defaultBranch of commonDefaults) {
                                                try {
                                                        const checkResult = await $`git ls-remote --heads origin ${defaultBranch}`.text()
                                                        if (checkResult.trim()) {
                                                                remoteRef = defaultBranch
                                                                debug(`Found default branch: ${remoteRef}`)
                                                                break
                                                        }
                                                } catch {
                                                        // Continue to next
                                                }
                                        }
                                }
                        } else {
                                debug("No git remote configured, trying common local default branches...")
                                const commonDefaults = ["main", "master"]
                                for (const defaultBranch of commonDefaults) {
                                        const localBranchCheck = await $`git rev-parse --verify ${defaultBranch}`.nothrow().quiet()
                                        if (localBranchCheck.exitCode === 0) {
                                                remoteRef = defaultBranch
                                                debug(`Found local default branch: ${remoteRef}`)
                                                break
                                        }
                                }
                        }

                        if (!remoteRef) {
                                console.error(
                                        "Could not determine default branch. Please specify with -b or -r option.",
                                )
                                process.exit(1)
                        }
                }

                let useLocalGitRef = false
                let localGitRef: string | null = null

                if (requestedRef) {
                        const localRefCheck = await $`git rev-parse --verify ${requestedRef}`.nothrow().quiet()
                        if (localRefCheck.exitCode === 0) {
                                useLocalGitRef = true
                                localGitRef = requestedRef
                                debug(`Detected local git ref: ${requestedRef}`)
                        } else {
                                debug(
                                        `Local git ref check failed for ${requestedRef} (exit code ${localRefCheck.exitCode}), using remote comparison`,
                                )
                        }
                }

                if (!remote && remoteRef && !useLocalGitRef) {
                        const localDefaultCheck = await $`git rev-parse --verify ${remoteRef}`.nothrow().quiet()
                        if (localDefaultCheck.exitCode === 0) {
                                useLocalGitRef = true
                                localGitRef = remoteRef
                                debug(`No remote configured; using local git ref: ${remoteRef}`)
                        }
                }

                const comparisonRef = (useLocalGitRef ? localGitRef : remoteRef) ?? null

                if (!comparisonRef) {
                        throw new Error("Unable to determine comparison ref")
                }

                if (useLocalGitRef) {
                        debug(`Using local git ref: ${comparisonRef}`)
                } else {
                        debug(`Using remote ref: ${comparisonRef}`)
                }

                // Build local version
                debug("Building local version...")
                const localPath = await kustomizeBuildToTmp(resolvedKustomizePath, "after.yaml", kustomizeOptions)
                debug(`Local build saved to: ${localPath}`)

                // Build comparison version (remote or local ref)
                let beforePath: string
                if (useLocalGitRef) {
                        debug(`Building local git ref (${comparisonRef})...`)
                        beforePath = await kustomizeBuildToTmp(resolvedKustomizePath, "before.yaml", kustomizeOptions, {
                                mode: "local",
                                ref: comparisonRef,
                                repoRoot,
                        })
                        debug(`Local git ref build saved to: ${beforePath}`)
                } else {
                        if (!remote) {
                                throw new Error(
                                        `No git remote configured; cannot compare against remote ref ${comparisonRef}. Configure a remote or specify a local ref.`,
                                )
                        }
                        debug(`Building remote version (${comparisonRef})...`)
                        beforePath = await kustomizeBuildToTmp(resolvedKustomizePath, "before.yaml", kustomizeOptions, {
                                mode: "remote",
                                ref: comparisonRef,
                                remote,
                                repoRoot,
                        })
                        debug(`Remote build saved to: ${beforePath}`)
                }

                // Apply filters if specified
                if (filterOptions.length > 0) {
                        debug("Applying filters to both builds...")
                        await filterYaml(localPath, filterOptions)
                        await filterYaml(beforePath, filterOptions)
                        debug("Filters applied successfully")
                }

                // Show diff
                debug(`\nShowing diff between ${comparisonRef} and local changes:`)
                debug("=".repeat(80))

                // Use YAML-based diff for better structured output
                const oldContent = await readFile(beforePath, "utf-8")
                const newContent = await readFile(localPath, "utf-8")
                const diffOutput = yamlDiff(oldContent, newContent)
                console.log(diffOutput)
	} catch (error) {
		console.error("Error:", error)
		process.exit(1)
	}
}

// Run the CLI
main()
