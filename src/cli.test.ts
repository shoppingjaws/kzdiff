import { describe, test, expect, beforeEach } from "bun:test";
import { $ } from "bun";
import { join } from "path";

describe("kzdiff CLI", () => {
	const CLI_PATH = join(process.cwd(), "src/cli.ts");
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

		test("should show version when --version flag is used", async () => {
			const { stdout, exitCode } = await runCLI(["--version"]);
			const { version } = await import("../package.json");

			expect(exitCode).toBe(0);
			expect(stdout.trim()).toBe(version);
		});

		test("should compare with auto-detected default branch", async () => {
			const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-v"]);

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
				"-v",
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain(`Building remote version (${TEST_COMMIT})...`);
			expect(stdout).toContain(
				`Showing diff between ${TEST_COMMIT} and local changes:`,
			);
			// The commit has different content, so we expect to see diff output
			expect(stdout).toContain("@@");

			// Verify specific differences in the output
			// The test commit has replica count 3, current has 5
			expect(stdout).toMatch(/replicas:\s*3/);
			expect(stdout).toMatch(/replicas:\s*5/);

			// The test commit uses nginx:1.24-alpine, current uses nginx:1.25-alpine
			expect(stdout).toContain("nginx:1.24-alpine");
			expect(stdout).toContain("nginx:1.25-alpine");

			// The test commit has memory limit 256Mi, current has 512Mi
			expect(stdout).toContain('"256Mi"');
			expect(stdout).toContain('"512Mi"');

			// Current version has additional team label that doesn't exist in test commit
			expect(stdout).toContain("team: platform");
		});

		test("should compare with branch name", async () => {
			const { stdout, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-b",
				"main",
				"-v",
			]);

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Building local version...");
			expect(stdout).toContain("Building remote version (main)...");
			expect(stdout).toContain("Showing diff between main and local changes:");
		});

		test("should accept -b and --branch aliases", async () => {
			const result1 = await runCLI([EXAMPLE_PATH, "-b", "main", "-v"]);
			const result2 = await runCLI([EXAMPLE_PATH, "--branch", "main", "-v"]);

			expect(result1.exitCode).toBe(0);
			expect(result2.exitCode).toBe(0);
			expect(result1.stdout).toContain("Building remote version (main)...");
			expect(result2.stdout).toContain("Building remote version (main)...");
		});

		test("should accept -r and --ref aliases", async () => {
			const result1 = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"]);
			const result2 = await runCLI([EXAMPLE_PATH, "--ref", TEST_COMMIT, "-v"]);

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
				"-v",
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
				"-v",
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
	});

	describe("Output verification", () => {
		test("should show differences when comparing different content", async () => {
			// Compare with the test commit which has different content
			const { stdout } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"]);

			// Should show diff output
			expect(stdout).toContain("---");
			expect(stdout).toContain("+++");
			expect(stdout).toContain("@@");
		});

		test("should show colored output by default", async () => {
			// When there are differences, diff should attempt to use colors
			// This is hard to test directly, but we can verify the diff command runs
			const { stdout } = await runCLI([EXAMPLE_PATH, "-b", "main", "-v"]);

			expect(stdout).toContain("Showing diff between");
			// The actual color codes would appear if there were differences
		});
	});

	describe("Debug output", () => {
		test("should show debug output when verbose flag is set", async () => {
			const { stdout, stderr } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				TEST_COMMIT,
				"-v",
			]);

			// Debug output should be in stdout
			expect(stdout).toContain("[kzdiff-cli]");
			expect(stdout).toContain("Processing path:");
			expect(stdout).toContain("Using remote ref:");
		});
	});

	describe("Integration scenarios", () => {
		test("should handle full workflow with specific commit", async () => {
			const { stdout, stderr, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-r",
				TEST_COMMIT,
				"-v",
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
