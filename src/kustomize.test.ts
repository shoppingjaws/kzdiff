import { describe, expect, test } from "bun:test";
import { stat } from "fs/promises";
import { join } from "path";
import { kustomizeBuildToTmp } from "./kustomize";
import { $ } from "bun";

// Test comment to trigger hook
describe("kustomizeBuildToTmp", () => {
	test("should build kustomize and save as before.yaml", async () => {
		const kustomizePath = join(process.cwd(), "examples/overlays/prod");
		const outputPath = await kustomizeBuildToTmp(kustomizePath, "before.yaml");

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file has content
		const content = await Bun.file(outputPath).text();
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("apiVersion:");

		// Check if filename is correct
		expect(outputPath).toMatch(/before\.yaml$/);
	});

	test("should build kustomize and save as after.yaml", async () => {
		const kustomizePath = join(process.cwd(), "examples/overlays/prod");
		const outputPath = await kustomizeBuildToTmp(kustomizePath, "after.yaml");

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file has content
		const content = await Bun.file(outputPath).text();
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("apiVersion:");

		// Check if filename is correct
		expect(outputPath).toMatch(/after\.yaml$/);
	});

	test("should accept kustomize options", async () => {
		const kustomizePath = join(process.cwd(), "examples/overlays/prod");
		const options = ["--enable-helm"];
		const outputPath = await kustomizeBuildToTmp(
			kustomizePath,
			"before.yaml",
			options,
		);

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file has content
		const content = await Bun.file(outputPath).text();
		expect(content.length).toBeGreaterThan(0);
	});

	test("should throw error for invalid kustomize path", async () => {
		const invalidPath = "/invalid/path/that/does/not/exist";

		expect(async () => {
			await kustomizeBuildToTmp(invalidPath, "before.yaml");
		}).toThrow("Failed to run kustomize build:");
	});

	test("should build from remote branch using Kustomize native support", async () => {
		// Get the current remote URL
		const remoteUrl = await $`git config --get remote.origin.url`.text();
		const remote = remoteUrl.trim();

		const outputPath = await kustomizeBuildToTmp(
			"examples/overlays/prod",
			"after.yaml",
			undefined,
			{ ref: "main", remote },
		);

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file has content
		const content = await Bun.file(outputPath).text();
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("apiVersion:");

		// Check if filename is correct
		expect(outputPath).toMatch(/after\.yaml$/);
	});

	test("should execute kustomize build command successfully (exit code 0)", async () => {
		const kustomizePath = join(process.cwd(), "examples/overlays/prod");

		// This should not throw an error if exit code is 0
		await expect(
			kustomizeBuildToTmp(kustomizePath, "before.yaml"),
		).resolves.toBeTruthy();

		// Also test with options
		await expect(
			kustomizeBuildToTmp(kustomizePath, "after.yaml", ["--enable-helm"]),
		).resolves.toBeTruthy();

		// Test direct shell command execution
		const result = await $`kustomize build ${kustomizePath}`.nothrow();
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBeTruthy();
		// Note: stderr may contain deprecation warnings, which is OK
	});

	test("should return empty file when remote directory does not exist", async () => {
		// Get the current remote URL
		const remoteUrl = await $`git config --get remote.origin.url`.text();
		const remote = remoteUrl.trim();

		// Use a non-existent directory path
		const nonExistentPath = "this/directory/does/not/exist";

		const outputPath = await kustomizeBuildToTmp(
			nonExistentPath,
			"before.yaml",
			undefined,
			{ ref: "main", remote },
		);

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file is empty
		const content = await Bun.file(outputPath).text();
		expect(content).toBe("");

		// Check if filename is correct
		expect(outputPath).toMatch(/before\.yaml$/);
	});

	test("should return empty file when directory exists in current branch but not in comparison branch", async () => {
		// Get the current remote URL
		const remoteUrl = await $`git config --get remote.origin.url`.text();
		const remote = remoteUrl.trim();

		// Use examples/overlays/nothing which exists in current branch but not in 3b4d8b0121ac84d7678591d8139b6eb5f88061d6
		const pathExistsNowButNotBefore = "examples/overlays/nothing";

		// Try to build from an older commit where this directory doesn't exist
		const outputPath = await kustomizeBuildToTmp(
			pathExistsNowButNotBefore,
			"before.yaml",
			undefined,
			{ ref: "3b4d8b0121ac84d7678591d8139b6eb5f88061d6", remote },
		);

		// Check if file exists
		const stats = await stat(outputPath);
		expect(stats.isFile()).toBe(true);

		// Check if file is empty (because directory doesn't exist in that ref)
		const content = await Bun.file(outputPath).text();
		expect(content).toBe("");

		// Check if filename is correct
		expect(outputPath).toMatch(/before\.yaml$/);

		// Verify that the directory DOES exist in current branch and builds successfully
		const currentBranchOutput = await kustomizeBuildToTmp(
			pathExistsNowButNotBefore,
			"after.yaml",
		);
		const currentContent = await Bun.file(currentBranchOutput).text();
		expect(currentContent.length).toBeGreaterThan(0);
		expect(currentContent).toContain("apiVersion:");
	});
});
