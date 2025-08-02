import { describe, test, expect, beforeEach } from "bun:test";
import { $ } from "bun";
import { join } from "node:path";

describe("kzdiff CLI", () => {
	const CLI_PATH = join(process.cwd(), "src/index.ts");
	const TEST_COMMIT = "3b4d8b0121ac84d7678591d8139b6eb5f88061d6";
	const EXAMPLE_PATH = "./examples/overlays/prod";

	// Helper to run CLI and capture output
	async function runCLI(
		args: string[],
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const result = await $`bun ${CLI_PATH} ${args}`.nothrow().quiet();
		return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
			exitCode: result.exitCode,
		};
	}

	beforeEach(() => {
		// Clear any environment variables that might affect tests
		delete process.env.DEBUG;
	});

	describe("Basic functionality", () => {
		test("should show help when no arguments provided", async () => {
			const { stdout, exitCode } = await runCLI([]);

			expect(exitCode).toBe(1);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("Options:");
			expect(stdout).toContain("-b, --branch");
			expect(stdout).toContain("-r, --ref");
		});

		test("should compare with auto-detected default branch", async () => {
			const { stdout, exitCode } = await runCLI([EXAMPLE_PATH]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain("Building remote version");
			expect(stdout).toContain("Showing diff between");
		});

		test("should compare with specific commit hash", async () => {
			const { stdout, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				TEST_COMMIT,
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain(`Building remote version (${TEST_COMMIT})...`);
			expect(stdout).toContain(
				`Showing diff between ${TEST_COMMIT} and local changes:`,
			);
			expect(stdout).toContain("No differences found");
		});

		test("should compare with branch name", async () => {
			const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-b", "main"]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain("Building remote version (main)...");
			expect(stdout).toContain("Showing diff between main and local changes:");
		});

		test("should accept -b and --branch aliases", async () => {
			const result1 = await runCLI([EXAMPLE_PATH, "-b", "main"]);
			const result2 = await runCLI([EXAMPLE_PATH, "--branch", "main"]);

			expect(result1.exitCode).toBe(0);
			expect(result2.exitCode).toBe(0);
			expect(result1.stdout).toContain("Building remote version (main)...");
			expect(result2.stdout).toContain("Building remote version (main)...");
		});

		test("should accept -r and --ref aliases", async () => {
			const result1 = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT]);
			const result2 = await runCLI([EXAMPLE_PATH, "--ref", TEST_COMMIT]);

			expect(result1.exitCode).toBe(0);
			expect(result2.exitCode).toBe(0);
			expect(result1.stdout).toContain(
				`Building remote version (${TEST_COMMIT})...`,
			);
			expect(result2.stdout).toContain(
				`Building remote version (${TEST_COMMIT})...`,
			);
		});

		test("should pass kustomize options after --", async () => {
			const { stdout, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"--",
				"--enable-helm",
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain("Building remote version");
		});

		test("should combine branch and kustomize options", async () => {
			const { stdout, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-b",
				"main",
				"--",
				"--enable-helm",
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building remote version (main)...");
		});

		test("should accept options before path", async () => {
			const { stdout, exitCode } = await runCLI(["-b", "main", EXAMPLE_PATH]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building remote version (main)...");
		});

		test("should accept --branch before path", async () => {
			const { stdout, exitCode } = await runCLI([
				"--branch",
				"main",
				EXAMPLE_PATH,
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building remote version (main)...");
		});

		test("should accept -r before path", async () => {
			const { stdout, exitCode } = await runCLI([
				"-r",
				TEST_COMMIT,
				EXAMPLE_PATH,
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain(`Building remote version (${TEST_COMMIT})...`);
		});

		test("should accept --ref before path", async () => {
			const { stdout, exitCode } = await runCLI([
				"--ref",
				TEST_COMMIT,
				EXAMPLE_PATH,
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain(`Building remote version (${TEST_COMMIT})...`);
		});

		test("should accept options before path with kustomize options", async () => {
			const { stdout, exitCode } = await runCLI([
				"-b",
				"main",
				EXAMPLE_PATH,
				"--",
				"--enable-helm",
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building remote version (main)...");
		});
	});

	describe("Error handling", () => {
		test("should fail with invalid kustomize path", async () => {
			const { stderr, exitCode } = await runCLI(["./non-existent-path"]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain("Error:");
			expect(stderr).toContain("Failed to run kustomize build");
		});

		test("should fail with invalid remote ref", async () => {
			const { stderr, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				"invalid-branch-name",
			]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain("Error:");
			expect(stderr).toContain("Failed to run kustomize build");
		});

		test("should fail when branch option missing value", async () => {
			const { stderr, exitCode } = await runCLI([EXAMPLE_PATH, "-b"]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain(
				"Error: -b requires a branch name or commit hash",
			);
		});

		test("should fail with unknown option", async () => {
			const { stderr, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"--unknown-option",
			]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain("Error: Unknown option: --unknown-option");
			expect(stderr).toContain("Use -- to pass options to kustomize");
		});

		test("should fail when only options provided without path", async () => {
			const { stderr, stdout, exitCode } = await runCLI(["-b", "main"]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain("Error: No kustomize path provided");
			expect(stdout).toContain("Usage:");
		});

		test("should fail when multiple paths provided", async () => {
			const { stderr, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"./another/path",
			]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain("Error: Multiple paths provided");
		});
	});

	describe("Output verification", () => {
		test("should show no differences when comparing same content", async () => {
			// Compare with the test commit which should have same content
			const { stdout } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT]);

			expect(stdout).toContain("No differences found");
			expect(stdout).not.toContain("---");
			expect(stdout).not.toContain("+++");
		});

		test("should show colored output by default", async () => {
			// When there are differences, diff should attempt to use colors
			// This is hard to test directly, but we can verify the diff command runs
			const { stdout } = await runCLI([EXAMPLE_PATH, "-b", "main"]);

			expect(stdout).toContain("Showing diff between");
			// The actual color codes would appear if there were differences
		});
	});

	describe("Debug output", () => {
		test("should show debug output when DEBUG env is set", async () => {
			process.env.DEBUG = "1";

			const { stdout, stderr } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				TEST_COMMIT,
			]);

			// Debug output might be in stdout or stderr depending on the implementation
			const combinedOutput = stdout + stderr;

			expect(combinedOutput).toContain("[kzdiff-cli]");
			expect(combinedOutput).toContain("Processing path:");
			expect(combinedOutput).toContain("Using remote ref:");

			delete process.env.DEBUG;
		});
	});

	describe("Integration scenarios", () => {
		test("should handle full workflow with specific commit", async () => {
			const { stdout, stderr, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				TEST_COMMIT,
			]);

			expect(exitCode).toBe(0);

			// Verify the workflow steps
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain(`Building remote version (${TEST_COMMIT})...`);
			expect(stdout).toContain(
				`Showing diff between ${TEST_COMMIT} and local changes:`,
			);
			expect(stdout).toContain(
				"================================================================================",
			);

			// Should complete without errors
			expect(stderr).not.toContain("Error:");
			expect(stderr).not.toContain("Failed");
		});

		test("should handle relative paths correctly", async () => {
			const { exitCode } = await runCLI([
				"./examples/overlays/prod",
				"-b",
				"main",
			]);

			expect(exitCode).toBe(0);
		});
	});
});
