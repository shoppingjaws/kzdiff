import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { rm, mkdtemp } from "fs/promises";
import { showDiff } from "./diff";

describe("showDiff", () => {
	let tempDir: string;
	let file1: string;
	let file2: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "diff-test-"));
		file1 = join(tempDir, "file1.yaml");
		file2 = join(tempDir, "file2.yaml");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("should show no differences for identical files", async () => {
		const content = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80`;

		await Bun.write(file1, content);
		await Bun.write(file2, content);

		// Capture console output
		const originalLog = console.log;
		let output = "";
		console.log = (msg: string) => {
			output += msg + "\n";
		};

		try {
			await showDiff(file1, file2);
			expect(output).toContain("No differences found");
		} finally {
			console.log = originalLog;
		}
	});

	test("should show differences between files", async () => {
		const content1 = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80`;

		const content2 = `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 8080`;

		await Bun.write(file1, content1);
		await Bun.write(file2, content2);

		// Capture console output
		const originalLog = console.log;
		let output = "";
		console.log = (msg: string) => {
			output += msg + "\n";
		};

		try {
			await showDiff(file1, file2, { color: false });
			expect(output).toContain("-  - port: 80");
			expect(output).toContain("+  - port: 8080");
		} finally {
			console.log = originalLog;
		}
	});

	test("should handle context option", async () => {
		const content1 = "line1\nline2\nline3\nline4\nline5";
		const content2 = "line1\nline2\nmodified\nline4\nline5";

		await Bun.write(file1, content1);
		await Bun.write(file2, content2);

		// Capture console output
		const originalLog = console.log;
		let output = "";
		console.log = (msg: string) => {
			output += msg + "\n";
		};

		try {
			await showDiff(file1, file2, { color: false, context: 1 });
			// Check that output contains the diff
			expect(output).toContain("-line3");
			expect(output).toContain("+modified");
		} finally {
			console.log = originalLog;
		}
	});

	test("should handle color fallback when --color is not supported", async () => {
		await Bun.write(file1, "line1");
		await Bun.write(file2, "line2");

		// Capture console output and debug output
		const originalLog = console.log;
		const originalDebug = console.debug;
		let output = "";
		let debugOutput = "";
		console.log = (msg: string) => {
			output += msg + "\n";
		};
		console.debug = (msg: string) => {
			debugOutput += msg + "\n";
		};

		try {
			// This will attempt color, but if it fails it should retry without color
			await showDiff(file1, file2, { color: true });
			// Should see diff output (with or without color fallback)
			expect(output).toContain("-line1");
			expect(output).toContain("+line2");
		} finally {
			console.log = originalLog;
			console.debug = originalDebug;
		}
	});
});
