import * as yaml from "js-yaml"
import type { K8sResource } from "./yaml-diff.types"

// Parse YAML documents
export function parseYamlDocuments(content: string): K8sResource[] {
	if (!content.trim()) return []

	try {
		const docs = yaml.loadAll(content) as unknown[]
		return docs.filter(
			(doc): doc is K8sResource => doc !== null && typeof doc === "object" && "kind" in doc && "apiVersion" in doc,
		)
	} catch (error) {
		console.error(`Error parsing YAML: ${error}`)
		return []
	}
}

// Get unique key for Kubernetes resource
export function getResourceKey(resource: K8sResource): string {
	const apiVersion = resource.apiVersion || ""
	const kind = resource.kind || "Unknown"
	const namespace = resource.metadata?.namespace || "default"
	const name = resource.metadata?.name || "unnamed"

	return `${apiVersion}/${kind}/${namespace}/${name}`
}

// Get display key for Kubernetes resource (used in output)
export function getResourceDisplayKey(resource: K8sResource): string {
	const apiVersion = resource.apiVersion || ""
	const kind = resource.kind || "Unknown"
	const namespace = resource.metadata?.namespace || "default"
	const name = resource.metadata?.name || "unnamed"

	return `${apiVersion}/${kind}/${namespace}/${name}`
}
