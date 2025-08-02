#!/usr/bin/env bun

import { $ } from "bun";
import { parseArgs } from "util";
import { kustomizeBuildToTmp } from "./kustomize";
import { createDebugLogger, setVerbose } from "./debug";
import { showDiff } from "./diff";

const debug = createDebugLogger("kzdiff-cli");

async function main() {
	const args = process.argv.slice(2);

	// Show help function
	const showHelp = (exitCode: number = 0) => {
		const progName = "kzdiff";
		const helpText = `Usage: ${progName} <kustomize-path> [options...]

Options:
  -b, --branch <ref>       Remote branch or commit to compare against
  -r, --ref <ref>          Same as -b/--branch (default: auto-detect)
  -h, --help               Show this help message
  -v, --verbose            Enable debug logging
  --exit-code              Exit with code 1 if differences are found
  --                       Pass remaining arguments to kustomize

Examples:
  ${progName} ./examples/overlays/prod
  ${progName} ./examples/overlays/prod -b develop
  ${progName} ./examples/overlays/prod -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13
  ${progName} ./examples/overlays/prod -- --enable-helm
  ${progName} ./examples/overlays/prod -b staging -- --enable-helm
  ${progName} ./examples/overlays/prod --exit-code

Note: When using commit hashes, use the full 40-character SHA`;

		console.log(helpText);
		process.exit(exitCode);
	};

	// Check for no arguments
	if (args.length === 0) {
		showHelp(1);
	}

	// Handle -- separator first
	let kustomizeOptions: string[] = [];
	const dashDashIndex = args.indexOf("--");
	let argsToProcess = args;

	if (dashDashIndex !== -1) {
		// Everything after -- goes to kustomize
		kustomizeOptions = args.slice(dashDashIndex + 1);
		argsToProcess = args.slice(0, dashDashIndex);
	}

	// Parse arguments using node:util parseArgs
	let values: any;
	let positionals: string[];

	try {
		const parsed = parseArgs({
			args: argsToProcess,
			options: {
				branch: {
					type: "string",
					short: "b",
				},
				ref: {
					type: "string",
					short: "r",
				},
				help: {
					type: "boolean",
					short: "h",
				},
				verbose: {
					type: "boolean",
					short: "v",
				},
				"exit-code": {
					type: "boolean",
				},
			},
			allowPositionals: true,
			strict: true,
			tokens: false,
		});
		values = parsed.values;
		positionals = parsed.positionals;
	} catch (error: any) {
		if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			// Extract just the unknown option part from the error message
			const match = error.message.match(/Unknown option '([^']+)'/);
			if (match) {
				console.error(`Error: Unknown option: ${match[1]}`);
			} else {
				console.error(`Error: ${error.message}`);
			}
			console.error("Use -- to pass options to kustomize");
			process.exit(1);
		} else if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
			// Handle missing option values
			const match = error.message.match(/Option '([^']+)'/);
			if (match) {
				const optionName = match[1].split(",")[0].trim();
				console.error(
					`Error: ${optionName} requires a branch name or commit hash`,
				);
			} else {
				console.error(`Error: ${error.message}`);
			}
			process.exit(1);
		}
		throw error;
	}

	// Check for help flag
	if (values.help) {
		showHelp(0);
	}

	// Set verbose logging if requested
	if (values.verbose) {
		setVerbose(true);
	}

	// Get kustomize path from positionals
	if (positionals.length === 0) {
		console.error("Error: No kustomize path provided");
		showHelp(1);
	} else if (positionals.length > 1) {
		console.error(
			`Error: Multiple paths provided: ${positionals.join(" and ")}`,
		);
		process.exit(1);
	}

	const kustomizePath = positionals[0];

	// Get remote ref from options (prefer ref over branch if both provided)
	let remoteRef = values.ref || values.branch || null;

	debug(`Processing path: ${kustomizePath}`);
	if (kustomizeOptions.length > 0) {
		debug(`Kustomize options: ${kustomizeOptions.join(" ")}`);
	}

	try {
		// Get current git remote and branch
		const remoteUrl = await $`git config --get remote.origin.url`.text();
		const remote = remoteUrl.trim();
		const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text();
		const branch = currentBranch.trim();

		debug(`Remote: ${remote}`);
		debug(`Current branch: ${branch}`);

		// If no remote ref specified, get the default branch
		if (!remoteRef) {
			debug("No remote ref specified, detecting default branch...");
			try {
				// Try to get the default branch from remote
				const defaultBranchResult =
					await $`git symbolic-ref refs/remotes/origin/HEAD`.text();
				remoteRef = defaultBranchResult
					.trim()
					.replace("refs/remotes/origin/", "");
				debug(`Detected default branch: ${remoteRef}`);
			} catch {
				// Fallback: try common default branches
				debug(
					"Could not detect default branch from remote, trying common defaults...",
				);
				const commonDefaults = ["main", "master"];
				for (const defaultBranch of commonDefaults) {
					try {
						const checkResult =
							await $`git ls-remote --heads origin ${defaultBranch}`.text();
						if (checkResult.trim()) {
							remoteRef = defaultBranch;
							debug(`Found default branch: ${remoteRef}`);
							break;
						}
					} catch {
						// Continue to next
					}
				}

				if (!remoteRef) {
					console.error(
						"Could not determine default remote branch. Please specify with -b or -r option.",
					);
					process.exit(1);
				}
			}
		}

		debug(`Using remote ref: ${remoteRef}`);

		// Build local version
		console.log("Building local version...");
		const localPath = await kustomizeBuildToTmp(
			kustomizePath,
			"after.yaml",
			kustomizeOptions,
		);
		debug(`Local build saved to: ${localPath}`);

		// Build remote version (from specified ref)
		console.log(`Building remote version (${remoteRef})...`);
		const remotePath = await kustomizeBuildToTmp(
			kustomizePath,
			"before.yaml",
			kustomizeOptions,
			{ ref: remoteRef, remote },
		);
		debug(`Remote build saved to: ${remotePath}`);

		// Show diff
		console.log(`\nShowing diff between ${remoteRef} and local changes:`);
		console.log("=".repeat(80));

		// Use the diff module to show differences
		const hasDifferences = await showDiff(remotePath, localPath, {
			color: true,
			context: 3,
		});

		// Exit with code 1 if differences are found and --exit-code is set
		if (hasDifferences && values["exit-code"]) {
			process.exit(1);
		}
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

// Run the CLI
main();
