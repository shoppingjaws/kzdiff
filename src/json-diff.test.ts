import { describe, it, expect } from "bun:test"
import { jsonDiff } from "./json-diff"

describe("jsonDiff", () => {
	it("should detect no changes for identical YAML", () => {
		const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3`

		const result = jsonDiff(yaml, yaml)
		expect(result).toContain("No differences found")
	})

	it("should detect added resource", () => {
		const oldYaml = ""
		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("Deployment (ADDED)")
		expect(result).toContain("test-app")
	})

	it("should detect removed resource", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3`
		const newYaml = ""

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("Deployment (REMOVED)")
		expect(result).toContain("test-app")
	})

	it("should detect modified field", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3`

		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 5`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("replicas:")
		expect(result).toContain("3")
		expect(result).toContain("5")
	})

	it("should handle multiple resources", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app1
spec:
  replicas: 1
---
apiVersion: v1
kind: Service
metadata:
  name: app1-svc
spec:
  type: ClusterIP`

		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app1
spec:
  replicas: 2
---
apiVersion: v1
kind: Service
metadata:
  name: app1-svc
spec:
  type: NodePort`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("Deployment")
		expect(result).toContain("Service")
		expect(result).toContain("replicas:")
		expect(result).toContain("type:")
		expect(result).toContain("ClusterIP")
		expect(result).toContain("NodePort")
	})

	it("should handle resources with namespace", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: production
spec:
  replicas: 3`

		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: production
spec:
  replicas: 5`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("namespace:")
		expect(result).toContain("production")
		expect(result).toContain("test-app")
	})

	it("should show context lines", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  labels:
    app: test
    version: v1
    environment: dev
spec:
  replicas: 3`

		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  labels:
    app: test
    version: v2
    environment: dev
spec:
  replicas: 3`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("version:")
		// Should contain context lines (before/after the changed line)
		expect(result).toContain("app: test")
		expect(result).toContain("environment: dev")
	})

	it("should handle arrays", () => {
		const oldYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  containers:
    - name: app
      image: nginx:1.19
      ports:
        - containerPort: 80`

		const newYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  containers:
    - name: app
      image: nginx:1.20
      ports:
        - containerPort: 8080`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("image:")
		expect(result).toContain("nginx:1.19")
		expect(result).toContain("nginx:1.20")
		expect(result).toContain("containerPort:")
		expect(result).toContain("80")
		expect(result).toContain("8080")
	})

	it("should handle multiline strings", () => {
		const oldYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: config
data:
  config.yaml: |
    server:
      port: 8080
      host: localhost`

		const newYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: config
data:
  config.yaml: |
    server:
      port: 9090
      host: 0.0.0.0`

		const result = jsonDiff(oldYaml, newYaml)
		expect(result).toContain("yaml:")
		expect(result).toContain("8080")
		expect(result).toContain("9090")
	})
})
