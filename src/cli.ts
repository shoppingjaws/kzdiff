#!/usr/bin/env bun

import { access, readFile } from "node:fs/promises"
import { $ } from "bun"
import { createDebugLogger, setVerbose } from "./debug"
import { filterYaml } from "./filter"
import { kustomizeBuildToTmp } from "./kustomize"
import { yamlDiff } from "./yaml-diff"

const debug = createDebugLogger("kzdiff-cli")

// Check if a file is a YAML file based on extension
function isYamlFile(filepath: string): boolean {
	return filepath.endsWith(".yaml") || filepath.endsWith(".yml")
}

// Check if a file exists
async function fileExists(filepath: string): Promise<boolean> {
	try {
		await access(filepath)
		return true
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
       ${progName} <file1.yaml> <file2.yaml> [options...]

Options:
  -b, --branch <ref>       Remote branch or commit to compare against (Kustomize mode only)
  -r, --ref <ref>          Same as -b/--branch (default: auto-detect)
  -f, --filter <expr>      Filter resources using JSONPath expressions (can be specified multiple times)
  -h, --help               Show this help message
  -v, --verbose            Enable verbose debug logging
  --version                Show version number
  --                       Pass remaining arguments to kustomize (Kustomize mode only)

Filter expressions (JSONPath):
  Simple shortcuts:
    kind=Deployment        → $[?(@.kind=='Deployment')]
    name=example-app       → $[?(@.metadata.name=='example-app')]
    namespace=prod         → $[?(@.metadata.namespace=='prod')]

  Full JSONPath expressions:
    $[?(@.kind=='Service')]
    $[?(@.spec.replicas>2)]
    $[?(@.metadata.labels.team=='platform')]

Examples (Kustomize mode):
  ${progName} ./examples/overlays/prod
  ${progName} ./examples/overlays/prod -b develop
  ${progName} ./examples/overlays/prod -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13
  ${progName} ./examples/overlays/prod -f kind=Deployment
  ${progName} ./examples/overlays/prod -f kind=Deployment -f kind=Service
  ${progName} ./examples/overlays/prod -- --enable-helm
  ${progName} ./examples/overlays/prod -b staging -- --enable-helm

Examples (Local YAML comparison):
  ${progName} before.yaml after.yaml
  ${progName} old-deployment.yaml new-deployment.yaml -f kind=Deployment
  ${progName} manifests-v1.yaml manifests-v2.yaml -v

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

	// Check if this is local YAML file comparison mode
	// Look for two consecutive YAML files at the beginning of args (before any options)
	let isLocalMode = false
	let file1: string | null = null
	let file2: string | null = null
	let optionsStartIndex = 1

	if (args.length >= 2 && isYamlFile(args[0] ?? "") && isYamlFile(args[1] ?? "")) {
		// Check if both files exist
		const firstFileExists = await fileExists(args[0] ?? "")
		const secondFileExists = await fileExists(args[1] ?? "")

		if (firstFileExists && secondFileExists) {
			isLocalMode = true
			file1 = args[0] ?? null
			file2 = args[1] ?? null
			optionsStartIndex = 2
			debug("Detected local YAML comparison mode")
			debug(`File 1: ${file1}`)
			debug(`File 2: ${file2}`)
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
				console.error(`Error: ${args[i]} is not supported in local YAML comparison mode`)
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
			if (isLocalMode) {
				console.error("Error: -- is not supported in local YAML comparison mode")
				process.exit(1)
			}
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

		if (isLocalMode && file1 && file2) {
			// Local YAML file comparison mode
			debug("Running in local YAML comparison mode")

			// Read files directly
			debug(`Reading file 1: ${file1}`)
			oldContent = await readFile(file1, "utf-8")
			debug(`Reading file 2: ${file2}`)
			newContent = await readFile(file2, "utf-8")

			// Apply filters if specified
			if (filterOptions.length > 0) {
				debug("Applying filters to both files...")
				const { mkdtemp, writeFile } = await import("node:fs/promises")
				const { join } = await import("node:path")
				const { tmpdir } = await import("node:os")

				// Create temporary files for filtering
				const tempDir = await mkdtemp(join(tmpdir(), "kzdiff-filter-"))
				const tempFile1 = join(tempDir, "file1.yaml")
				const tempFile2 = join(tempDir, "file2.yaml")

				// Write to temp files
				await writeFile(tempFile1, oldContent)
				await writeFile(tempFile2, newContent)

				// Apply filters
				await filterYaml(tempFile1, filterOptions)
				await filterYaml(tempFile2, filterOptions)

				// Read filtered content
				oldContent = await readFile(tempFile1, "utf-8")
				newContent = await readFile(tempFile2, "utf-8")
				debug("Filters applied successfully")
			}

			debug(`\nShowing diff between ${file1} and ${file2}:`)
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
