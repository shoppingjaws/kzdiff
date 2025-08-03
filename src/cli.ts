#!/usr/bin/env bun

import { $ } from "bun";
import { kustomizeBuildToTmp } from "./kustomize";
import { createDebugLogger, setVerbose } from "./debug";
import { showDiff } from "./diff";

const debug = createDebugLogger("kzdiff-cli");

async function main() {
	const args = process.argv.slice(2);

	// Show help function
	const   showHelp   =   (exitCode: number = 0)   =>   {
		const progName = "kzdiff";
		const helpText = `Usage: ${progName} <kustomize-path> [options...]

Options:
  -b, --branch <ref>       Remote branch or commit to compare against
  -r, --ref <ref>          Same as -b/--branch (default: auto-detect)
  -h, --help               Show this help message
  -v, --verbose            Enable verbose debug logging
  --                       Pass remaining arguments to kustomize

Examples:
  ${progName} ./examples/overlays/prod
  ${progName} ./examples/overlays/prod -b develop
  ${progName} ./examples/overlays/prod -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13
  ${progName} ./examples/overlays/prod -- --enable-helm
  ${progName} ./examples/overlays/prod -b staging -- --enable-helm

Note: When using commit hashes, use the full 40-character SHA`;

		console.log(helpText);
		process.exit(exitCode);
	};

	// Check for help flag
	if (args.includes("-h") || args.includes("--help")) {
		showHelp(0);
	}

	if (args.length === 0) {
		showHelp(1);
	}

	const kustomizePath = args[0];
	let remoteRef: string | null = null;
	let kustomizeOptions: string[] = [];
	let verbose = false;

	// Parse arguments
	for (let i = 1; i < args.length; i++) {
		if (
			args[i] === "-b" ||
			args[i] === "--branch" ||
			args[i] === "-r" ||
			args[i] === "--ref"
		) {
			if (i + 1 < args.length) {
				remoteRef = args[i + 1];
				i++; // Skip next argument
			} else {
				console.error(
					`Error: ${args[i]} requires a branch name or commit hash`,
				);
				process.exit(1);
			}
		} else if (args[i] === "-v" || args[i] === "--verbose") {
			verbose = true;
		} else if (args[i] === "--") {
			// Everything after -- goes to kustomize
			kustomizeOptions = args.slice(i + 1);
			break;
		} else {
			console.error(`Error: Unknown option: ${args[i]}`);
			console.error("Use -- to pass options to kustomize");
			process.exit(1);
		}
	}

	// Enable verbose mode if requested
	if (verbose) {
		setVerbose(true);
	}

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
		debug("Building local version...");
		const localPath = await kustomizeBuildToTmp(
			kustomizePath,
			"after.yaml",
			kustomizeOptions,
		);
		debug(`Local build saved to: ${localPath}`);

		// Build remote version (from specified ref)
		debug(`Building remote version (${remoteRef})...`);
		const remotePath = await kustomizeBuildToTmp(
			kustomizePath,
			"before.yaml",
			kustomizeOptions,
			{ ref: remoteRef, remote },
		);
		debug(`Remote build saved to: ${remotePath}`);

		// Show diff
		debug(`\nShowing diff between ${remoteRef} and local changes:`);
		debug("=".repeat(80));

		// Use the diff module to show differences
		await showDiff(remotePath, localPath, {
			color: true,
			context: 3,
		});
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

// Run the CLI
main();
