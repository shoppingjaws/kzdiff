import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { filterYaml } from "./filter";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import * as yaml from "js-yaml";

describe("filterYaml", () => {
	let tempDir: string;
	let testFile: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "filter-test-"));
		testFile = join(tempDir, "test.yaml");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("Basic filtering", () => {
		test("should filter by kind", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
spec:
  replicas: 2
---
apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  type: ClusterIP
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: another-deployment
spec:
  replicas: 3
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["kind=Deployment"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			expect(docs[0].kind).toBe("Deployment");
			expect(docs[1].kind).toBe("Deployment");
		});

		test("should filter by metadata.name", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-one
spec:
  replicas: 2
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-two
spec:
  replicas: 3
---
apiVersion: v1
kind: Service
metadata:
  name: app-one
spec:
  type: ClusterIP
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["name=app-one"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			expect(docs[0].metadata.name).toBe("app-one");
			expect(docs[1].metadata.name).toBe("app-one");
		});

		test("should filter by namespace", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
  namespace: production
spec:
  replicas: 2
---
apiVersion: v1
kind: Service
metadata:
  name: test-service
  namespace: staging
spec:
  type: ClusterIP
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: another-deployment
  namespace: production
spec:
  replicas: 3
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["namespace=production"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			expect(docs[0].metadata.namespace).toBe("production");
			expect(docs[1].metadata.namespace).toBe("production");
		});
	});

	describe("Multiple filters", () => {
		test("should apply multiple filters (OR logic)", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
spec:
  replicas: 2
---
apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  type: ClusterIP
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  key: value
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["kind=Deployment", "kind=Service"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			const kinds = docs.map((d: any) => d.kind).sort();
			expect(kinds).toEqual(["Deployment", "Service"]);
		});
	});

	describe("JSONPath expressions", () => {
		test("should support JSONPath expressions", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
spec:
  replicas: 5
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: small-deployment
spec:
  replicas: 1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: medium-deployment
spec:
  replicas: 3
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["$[?(@.spec.replicas>2)]"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			expect(docs[0].spec.replicas).toBeGreaterThan(2);
			expect(docs[1].spec.replicas).toBeGreaterThan(2);
		});

		test("should support complex JSONPath with labels", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
  labels:
    team: platform
    env: prod
spec:
  replicas: 2
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: another-deployment
  labels:
    team: frontend
    env: prod
spec:
  replicas: 3
---
apiVersion: v1
kind: Service
metadata:
  name: test-service
  labels:
    team: platform
spec:
  type: ClusterIP
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["$[?(@.metadata.labels.team=='platform')]"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(2);
			expect(docs[0].metadata.labels.team).toBe("platform");
			expect(docs[1].metadata.labels.team).toBe("platform");
		});
	});

	describe("Edge cases", () => {
		test("should handle empty file", async () => {
			await Bun.write(testFile, "");
			await filterYaml(testFile, ["kind=Deployment"]);

			const filtered = await Bun.file(testFile).text();
			expect(filtered).toBe("");
		});

		test("should handle file with no matches", async () => {
			const content = `
apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  type: ClusterIP
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["kind=Deployment"]);

			const filtered = await Bun.file(testFile).text();
			expect(filtered).toBe("");
		});

		test("should handle invalid YAML gracefully", async () => {
			await Bun.write(testFile, "invalid: yaml: content:");

			// Should throw error for invalid YAML
			await expect(filterYaml(testFile, ["kind=Deployment"])).rejects.toThrow();
		});

		test("should return immediately with no filters", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, []);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			// Content should be unchanged
			expect(docs.length).toBe(1);
			expect(docs[0].kind).toBe("Deployment");
		});
	});

	describe("Simple filter syntax", () => {
		test("should parse kind= syntax", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test
---
apiVersion: v1
kind: Service
metadata:
  name: test
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ["kind=Service"]);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(1);
			expect(docs[0].kind).toBe("Service");
		});

		test("should handle values with spaces", async () => {
			const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: "my app deployment"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
`;
			await Bun.write(testFile, content);
			await filterYaml(testFile, ['name="my app deployment"']);

			const filtered = await Bun.file(testFile).text();
			const docs = yaml.loadAll(filtered);

			expect(docs.length).toBe(1);
			expect(docs[0].metadata.name).toBe("my app deployment");
		});
	});
});
