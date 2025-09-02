import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { yamlDiff } from "./index"

describe("yamlDiff", () => {
	// Get all test case directories
	const fixturesDir = join(__dirname, "integration-test")
	const testCases = readdirSync(fixturesDir, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("case_"))
		.map((dirent) => dirent.name)

	// Run test for each case
	for (const testCase of testCases) {
		test(`${testCase}: should match dyff output exactly`, () => {
			const caseDir = join(fixturesDir, testCase)

			// Load test fixtures
			const beforeYaml = readFileSync(join(caseDir, "before.yaml"), "utf-8")
			const afterYaml = readFileSync(join(caseDir, "after.yaml"), "utf-8")
			const expectedOutput = readFileSync(join(caseDir, "expected.txt"), "utf-8")

			// Run the diff
			const result = yamlDiff(beforeYaml, afterYaml, {
				ignoreOrderChanges: true,
				omitHeader: true,
			})

			// The result should exactly match the dyff output
			expect(result).toBe(expectedOutput)
		})
	}
})
