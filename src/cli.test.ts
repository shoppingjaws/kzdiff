import { describe, test, expect, beforeEach, beforeAll, afterAll } from "bun:test"
import { $ } from "bun"
import { join } from "node:path"

const HAS_KUSTOMIZE = Boolean(Bun.which("kustomize"))
const remoteConfigResult = await $`git config --get remote.origin.url`.nothrow().quiet()
const HAS_REMOTE = remoteConfigResult.exitCode === 0
const describeIfCliReady = HAS_KUSTOMIZE ? describe : describe.skip

function expectComparisonBuildMessage(stdout: string, ref?: string) {
        if (ref) {
                if (HAS_REMOTE) {
                        expect(stdout).toContain(`Building remote version (${ref})...`)
                } else {
                        expect(stdout).toContain(`Building local git ref (${ref})...`)
                }
        } else {
                if (HAS_REMOTE) {
                        expect(stdout).toContain("Building remote version")
                } else {
                        expect(stdout).toContain("Building local git ref")
                }
        }
}

describeIfCliReady("kzdiff CLI", () => {
	const CLI_PATH = join(process.cwd(), "src/cli.ts")
        const TEST_COMMIT = "3b4d8b0121ac84d7678591d8139b6eb5f88061d6"
        const EXAMPLE_PATH = "./examples/overlays/prod"

        let createdMainBranch = false

        // Helper to run CLI and capture output
        async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
                const result = await $`bun ${CLI_PATH} ${args}`.nothrow().quiet()
                return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
			exitCode: result.exitCode,
		}
        }

        beforeAll(async () => {
                if (!HAS_REMOTE) {
                        const mainCheck = await $`git rev-parse --verify main`.nothrow().quiet()
                        if (mainCheck.exitCode !== 0) {
                                await $`git branch main ${TEST_COMMIT}`.quiet()
                                createdMainBranch = true
                        }
                }
        })

        afterAll(async () => {
                if (createdMainBranch) {
                        await $`git branch -D main`.nothrow().quiet()
                }
        })

        beforeEach(() => {
                // Clear any environment variables that might affect tests
                delete process.env.DEBUG
        })

	describe("Basic functionality", () => {
		test("should show help when no arguments provided", async () => {
			const { stdout, exitCode } = await runCLI([])

			expect(exitCode).toBe(1)
			expect(stdout).toContain("Usage:")
			expect(stdout).toContain("Options:")
			expect(stdout).toContain("-b, --branch")
			expect(stdout).toContain("-r, --ref")
			expect(stdout).toContain("-f, --filter")
			expect(stdout).toContain("Filter expressions (JSONPath):")
		})

		test("should show version when --version flag is used", async () => {
			const { stdout, exitCode } = await runCLI(["--version"])
			const { version } = await import("../package.json")

			expect(exitCode).toBe(0)
			expect(stdout.trim()).toBe(version)
		})

                test("should compare with auto-detected default branch", async () => {
                        const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-v"])

                        expect(exitCode).toBe(0)
                        expect(stdout).toContain("Building local version...")
                        expectComparisonBuildMessage(stdout)
                        expect(stdout).toContain("Showing diff between")
                })

                test("should compare with specific commit hash", async () => {
                        const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"])

                        expect(exitCode).toBe(0)
                        expect(stdout).toContain("Building local version...")
                        expectComparisonBuildMessage(stdout, TEST_COMMIT)
                        expect(stdout).toContain(`Showing diff between ${TEST_COMMIT} and local changes:`)
                        // The commit has different content, so we expect to see diff output (dyff format)
                        expect(stdout).toContain("metadata.labels")

			// Current version has additional team label that doesn't exist in test commit
			expect(stdout).toContain("team: platform")
		})

                test("should compare with branch name", async () => {
                        const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-b", "main", "-v"])

                        expect(exitCode).toBe(0)
                        expect(stdout).toContain("Building local version...")
                        expectComparisonBuildMessage(stdout, "main")
                        expect(stdout).toContain("Showing diff between main and local changes:")
                })

                test("should compare with a purely local branch", async () => {
                        const localBranch = "kzdiff-test-local-branch"
                        await $`git branch -f ${localBranch} ${TEST_COMMIT}`.quiet()

                        try {
                                const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-b", localBranch, "-v"])

                                expect(exitCode).toBe(0)
                                expect(stdout).toContain(`Detected local git ref: ${localBranch}`)
                                expect(stdout).toContain(`Building local git ref (${localBranch})...`)
                                expect(stdout).toContain(`Showing diff between ${localBranch} and local changes:`)
                        } finally {
                                await $`git branch -D ${localBranch}`.nothrow().quiet()
                        }
                })

                test("should accept -b and --branch aliases", async () => {
                        const result1 = await runCLI([EXAMPLE_PATH, "-b", "main", "-v"])
                        const result2 = await runCLI([EXAMPLE_PATH, "--branch", "main", "-v"])

                        expect(result1.exitCode).toBe(0)
                        expect(result2.exitCode).toBe(0)
                        expectComparisonBuildMessage(result1.stdout, "main")
                        expectComparisonBuildMessage(result2.stdout, "main")
                })

                test("should accept -r and --ref aliases", async () => {
                        const result1 = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"])
                        const result2 = await runCLI([EXAMPLE_PATH, "--ref", TEST_COMMIT, "-v"])

                        expect(result1.exitCode).toBe(0)
                        expect(result2.exitCode).toBe(0)
                        expectComparisonBuildMessage(result1.stdout, TEST_COMMIT)
                        expectComparisonBuildMessage(result2.stdout, TEST_COMMIT)
                })

                test("should pass kustomize options after --", async () => {
                        const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-v", "--", "--enable-helm"])

                        expect(exitCode).toBe(0)
                        expect(stdout).toContain("Building local version...")
                        expectComparisonBuildMessage(stdout)
                })

                test("should combine branch and kustomize options", async () => {
                        const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-b", "main", "-v", "--", "--enable-helm"])

                        expect(exitCode).toBe(0)
                        expectComparisonBuildMessage(stdout, "main")
                })
	})

	describe("Error handling", () => {
		test("should fail with invalid kustomize path", async () => {
			const { stderr, exitCode } = await runCLI(["./non-existent-path"])

			expect(exitCode).toBe(1)
			expect(stderr).toContain("Error:")
			expect(stderr).toContain("Failed to run kustomize build")
		})

                test("should fail with invalid remote ref", async () => {
                        const { stderr, exitCode } = await runCLI([EXAMPLE_PATH, "-r", "invalid-branch-name"])

                        expect(exitCode).toBe(1)
                        expect(stderr).toContain("Error:")
                        if (HAS_REMOTE) {
                                expect(stderr).toContain("Failed to run kustomize build")
                        } else {
                                expect(stderr).toContain("No git remote configured")
                        }
                })

		test("should fail when branch option missing value", async () => {
			const { stderr, exitCode } = await runCLI([EXAMPLE_PATH, "-b"])

			expect(exitCode).toBe(1)
			expect(stderr).toContain("Error: -b requires a branch name or commit hash")
		})

		test("should fail with unknown option", async () => {
			const { stderr, exitCode } = await runCLI([EXAMPLE_PATH, "--unknown-option"])

			expect(exitCode).toBe(1)
			expect(stderr).toContain("Error: Unknown option: --unknown-option")
			expect(stderr).toContain("Use -- to pass options to kustomize")
		})

		test("should fail when filter option missing value", async () => {
			const { stderr, exitCode } = await runCLI([EXAMPLE_PATH, "-f"])

			expect(exitCode).toBe(1)
			expect(stderr).toContain("Error: -f requires a filter expression")
		})
	})

	describe("Output verification", () => {
		test("should show differences when comparing different content", async () => {
			// Compare with the test commit which has different content
			const { stdout } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"])

			// Should show diff output (YAML format)
			expect(stdout).toContain("metadata.labels")
			expect(stdout).toContain("spec.selector")
			expect(stdout).toContain("team: platform")
		})

		test("should show colored output by default", async () => {
			// When there are differences, diff should attempt to use colors
			// This is hard to test directly, but we can verify the diff command runs
			const { stdout } = await runCLI([EXAMPLE_PATH, "-b", "main", "-v"])

			expect(stdout).toContain("Showing diff between")
			// The actual color codes would appear if there were differences
		})
	})

	describe("Debug output", () => {
                test("should show debug output when verbose flag is set", async () => {
                        const { stdout } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"])

                        // Debug output should be in stdout
                        expect(stdout).toContain("[kzdiff-cli]")
                        expect(stdout).toContain("Processing path:")
                        if (HAS_REMOTE) {
                                expect(stdout).toContain("Using remote ref:")
                        } else {
                                expect(stdout).toContain("Using local git ref:")
                        }
                })
	})

	describe("Integration scenarios", () => {
		test("should handle full workflow with specific commit", async () => {
			const { stdout, stderr, exitCode } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-v"])

                        expect(exitCode).toBe(0)

                        // Verify the workflow steps
                        expect(stdout).toContain("Building local version...")
                        expectComparisonBuildMessage(stdout, TEST_COMMIT)
                        expect(stdout).toContain(`Showing diff between ${TEST_COMMIT} and local changes:`)
			expect(stdout).toContain("================================================================================")

			// Should complete without errors
			expect(stderr).not.toContain("Error:")
			expect(stderr).not.toContain("Failed")
		})

		test("should handle relative paths correctly", async () => {
			const { exitCode } = await runCLI(["./examples/overlays/prod", "-b", "main"])

			expect(exitCode).toBe(0)
		})
	})

	describe("Filter functionality", () => {
		test("should accept -f and --filter options", async () => {
			const result1 = await runCLI([EXAMPLE_PATH, "-b", "main", "-f", "kind=Deployment", "-v"])
			const result2 = await runCLI([EXAMPLE_PATH, "-b", "main", "--filter", "kind=Service", "-v"])

			expect(result1.exitCode).toBe(0)
			expect(result2.exitCode).toBe(0)
			expect(result1.stdout).toContain("Applying filters to both builds")
			expect(result2.stdout).toContain("Applying filters to both builds")
		})

		test("should accept multiple filter options", async () => {
			const { stdout, exitCode } = await runCLI([
				EXAMPLE_PATH,
				"-b",
				"main",
				"-f",
				"kind=Deployment",
				"-f",
				"kind=Service",
				"-v",
			])

                        expect(exitCode).toBe(0)
                        expect(stdout).toContain("Filter options: kind=Deployment, kind=Service")
                        expect(stdout).toContain("Applying filters to both builds")
                })

		test("should work with JSONPath expressions", async () => {
			const { stdout, exitCode } = await runCLI([EXAMPLE_PATH, "-b", "main", "-f", "$[?(@.kind=='Deployment')]", "-v"])

			expect(exitCode).toBe(0)
			expect(stdout).toContain("Applying filters to both builds")
		})

		test("should combine filters with other options", async () => {
                        const { stdout, exitCode } = await runCLI([
                                EXAMPLE_PATH,
                                "-r",
                                TEST_COMMIT,
                                "-f",
                                "kind=Deployment",
                                "-v",
                                "--",
                                "--enable-helm",
                        ])

                        expect(exitCode).toBe(0)
                        expectComparisonBuildMessage(stdout, TEST_COMMIT)
                        expect(stdout).toContain("Applying filters to both builds")
                })

		test("should show filtered content in diff", async () => {
			// This test verifies that filtering is actually applied
			// by checking that the diff output changes when filter is used
			const { stdout: withoutFilter } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT])

			const { stdout: withFilter } = await runCLI([EXAMPLE_PATH, "-r", TEST_COMMIT, "-f", "kind=Deployment"])

			// The filtered output should be different (likely shorter)
			// as it only includes Deployments
			expect(withFilter.length).toBeLessThan(withoutFilter.length)
		})
	})
})
