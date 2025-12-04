#!/usr/bin/env bun

import { readFile, stat } from "node:fs/promises"
import { $ } from "bun"
import { createDebugLogger, setVerbose } from "./debug"
import { filterYaml } from "./filter"
import { kustomizeBuildToTmp } from "./kustomize"
import { yamlDiff } from "./yaml-diff"

const debug = createDebugLogger("kzdiff-cli")

// Check if a path is a directory
async function isDirectory(path: string): Promise<boolean> {
	try {
		const stats = await stat(path)
		return stats.isDirectory()
	} catch {
		return false
	}
}

async function main() {
	const args = process.argv.slice(2)

	// Show help function
	const showHelp = (exitCode: number = 0) => {
		const progName = "kzdiff"
		const helpText = `Usage: ${progName} <kustomize-path> [options...]
       ${progName} <kustomize-path1> <kustomize-path2> [options...]

Options:
  -b, --branch <ref>       Remote branch or commit to compare against (remote comparison only)
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

Examples (Remote branch comparison):
  ${progName} ./overlays/prod
  ${progName} ./overlays/prod -b develop
  ${progName} ./overlays/prod -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13
  ${progName} ./overlays/prod -f kind=Deployment
  ${progName} ./overlays/prod -- --enable-helm

Examples (Local directory comparison):
  ${progName} ./overlays/stg ./overlays/prd
  ${progName} ./overlays/stg ./overlays/prd -f kind=Deployment
  ${progName} ./overlays/stg ./overlays/prd -- --enable-helm

Note: When using commit hashes, use the full 40-character SHA`

		console.log(helpText)
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

	// Check if this is local Kustomize directory comparison mode
	// Look for two consecutive directory paths at the beginning of args (before any options)
	let isLocalMode = false
	let path1: string | null = null
	let path2: string | null = null
	let optionsStartIndex = 1

	if (args.length >= 2) {
		const firstArg = args[0] ?? ""
		const secondArg = args[1] ?? ""

		// Check if both are directories
		const firstIsDir = await isDirectory(firstArg)
		const secondIsDir = await isDirectory(secondArg)

		if (firstIsDir && secondIsDir) {
			isLocalMode = true
			path1 = firstArg
			path2 = secondArg
			optionsStartIndex = 2
			debug("Detected local Kustomize directory comparison mode")
			debug(`Path 1: ${path1}`)
			debug(`Path 2: ${path2}`)
		}
	}

	const kustomizePath = args[0] as string // We know args[0] exists after the length check
	let remoteRef: string | null = null
	let kustomizeOptions: string[] = []
	let verbose = false
	const filterOptions: string[] = []

	// Parse arguments
	for (let i = optionsStartIndex; i < args.length; i++) {
		if (args[i] === "-b" || args[i] === "--branch" || args[i] === "-r" || args[i] === "--ref") {
			if (isLocalMode) {
				console.error(`Error: ${args[i]} is not supported in local directory comparison mode`)
				process.exit(1)
			}
			if (i + 1 < args.length && args[i + 1] !== undefined) {
				remoteRef = args[i + 1] ?? null
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

	debug(`Processing path: ${kustomizePath}`)
	if (kustomizeOptions.length > 0) {
		debug(`Kustomize options: ${kustomizeOptions.join(" ")}`)
	}
	if (filterOptions.length > 0) {
		debug(`Filter options: ${filterOptions.join(", ")}`)
	}

	try {
		let oldContent: string
		let newContent: string

		if (isLocalMode && path1 && path2) {
			// Local Kustomize directory comparison mode
			debug("Running in local Kustomize directory comparison mode")

			// Build first directory
			debug(`Building path 1: ${path1}`)
			const firstPath = await kustomizeBuildToTmp(path1, "before.yaml", kustomizeOptions)
			debug(`First build saved to: ${firstPath}`)

			// Build second directory
			debug(`Building path 2: ${path2}`)
			const secondPath = await kustomizeBuildToTmp(path2, "after.yaml", kustomizeOptions)
			debug(`Second build saved to: ${secondPath}`)

			// Apply filters if specified
			if (filterOptions.length > 0) {
				debug("Applying filters to both builds...")
				await filterYaml(firstPath, filterOptions)
				await filterYaml(secondPath, filterOptions)
				debug("Filters applied successfully")
			}

			// Read build results
			oldContent = await readFile(firstPath, "utf-8")
			newContent = await readFile(secondPath, "utf-8")

			debug(`\nShowing diff between ${path1} and ${path2}:`)
			debug("=".repeat(80))
		} else {
			// Kustomize build comparison mode
			// Get current git remote and branch
			const remoteUrl = await $`git config --get remote.origin.url`.text()
			const remote = remoteUrl.trim()
			const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text()
			const branch = currentBranch.trim()

			debug(`Remote: ${remote}`)
			debug(`Current branch: ${branch}`)

			// If no remote ref specified, get the default branch
			if (!remoteRef) {
				debug("No remote ref specified, detecting default branch...")
				try {
					// Try to get the default branch from remote
					const defaultBranchResult = await $`git symbolic-ref refs/remotes/origin/HEAD`.text()
					remoteRef = defaultBranchResult.trim().replace("refs/remotes/origin/", "")
					debug(`Detected default branch: ${remoteRef}`)
				} catch {
					// Fallback: try common default branches
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

					if (!remoteRef) {
						console.error("Could not determine default remote branch. Please specify with -b or -r option.")
						process.exit(1)
					}
				}
			}

			debug(`Using remote ref: ${remoteRef}`)

			// Build local version
			debug("Building local version...")
			const localPath = await kustomizeBuildToTmp(kustomizePath, "after.yaml", kustomizeOptions)
			debug(`Local build saved to: ${localPath}`)

			// Build remote version (from specified ref)
			debug(`Building remote version (${remoteRef})...`)
			const remotePath = await kustomizeBuildToTmp(kustomizePath, "before.yaml", kustomizeOptions, {
				ref: remoteRef,
				remote,
			})
			debug(`Remote build saved to: ${remotePath}`)

			// Apply filters if specified
			if (filterOptions.length > 0) {
				debug("Applying filters to both builds...")
				await filterYaml(localPath, filterOptions)
				await filterYaml(remotePath, filterOptions)
				debug("Filters applied successfully")
			}

			// Show diff
			debug(`\nShowing diff between ${remoteRef} and local changes:`)
			debug("=".repeat(80))

			// Use YAML-based diff for better structured output
			oldContent = await readFile(remotePath, "utf-8")
			newContent = await readFile(localPath, "utf-8")
		}

		const diffOutput = yamlDiff(oldContent, newContent)
		console.log(diffOutput)
	} catch (error) {
		console.error("Error:", error)
		process.exit(1)
	}
}

// Run the CLI
main()
