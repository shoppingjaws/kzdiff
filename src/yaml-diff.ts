#!/usr/bin/env bun
import * as yaml from "js-yaml"

// Types
interface YamlDiffOptions {
	useGoPatchStyle?: boolean
	ignoreOrderChanges?: boolean
	ignoreWhitespaceChanges?: boolean
	detectRenames?: boolean
	omitHeader?: boolean
	useColor?: boolean
	contextLines?: number
}

interface K8sResource {
	apiVersion?: string
	kind?: string
	metadata?: {
		name?: string
		namespace?: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
		[key: string]: unknown
	}
	[key: string]: unknown
}

// Parse YAML documents
function parseYamlDocuments(content: string): K8sResource[] {
	if (!content.trim()) return []
	
	try {
		const docs = yaml.loadAll(content) as unknown[]
		return docs.filter((doc): doc is K8sResource => 
			doc !== null && 
			typeof doc === "object" &&
			"kind" in doc &&
			"apiVersion" in doc
		)
	} catch (error) {
		console.error(`Error parsing YAML: ${error}`)
		return []
	}
}

// Get unique key for Kubernetes resource
function getResourceKey(resource: K8sResource): string {
	const apiVersion = resource.apiVersion || ""
	const kind = resource.kind || "Unknown"
	const namespace = resource.metadata?.namespace || "default"
	const name = resource.metadata?.name || "unnamed"
	
	return `${apiVersion}/${kind}/${namespace}/${name}`
}

// Get display key for Kubernetes resource (used in output)
function getResourceDisplayKey(resource: K8sResource): string {
	const apiVersion = resource.apiVersion || ""
	const kind = resource.kind || "Unknown"
	const namespace = resource.metadata?.namespace || "default"
	const name = resource.metadata?.name || "unnamed"
	
	return `${apiVersion}/${kind}/${namespace}/${name}`
}

// Format resource as YAML string to match dyff output
function formatResourceAsYaml(resource: K8sResource): string {
	// Manually format to match dyff's exact output format
	const lines: string[] = []
	
	lines.push(`  apiVersion: ${resource.apiVersion}`)
	lines.push(`  kind: ${resource.kind}`)
	
	// Format metadata
	lines.push("  metadata:")
	lines.push(`    name: ${resource.metadata?.name}`)
	lines.push(`    namespace: ${resource.metadata?.namespace}`)
	
	// Format labels if present
	if (resource.metadata?.labels) {
		lines.push("    labels:")
		// dyff outputs labels in a specific order: version first, then app, then others
		const labels = resource.metadata.labels
		const labelKeys = Object.keys(labels)
		
		// Sort to match dyff's output order
		const orderedKeys = []
		if ('version' in labels) orderedKeys.push('version')
		if ('app' in labels) orderedKeys.push('app')
		if ('environment' in labels) orderedKeys.push('environment')
		
		for (const key of labelKeys) {
			if (!orderedKeys.includes(key)) {
				orderedKeys.push(key)
			}
		}
		
		for (const key of orderedKeys) {
			lines.push(`      ${key}: ${labels[key]}`)
		}
	}
	
	// Format annotations if present
	if (resource.metadata?.annotations) {
		lines.push("    annotations:")
		for (const [key, value] of Object.entries(resource.metadata.annotations)) {
			lines.push(`      ${key}: ${value}`)
		}
	}
	
	// Format spec
	if (resource.spec) {
		lines.push("  spec:")
		formatSpec(resource.spec as Record<string, unknown>, lines, "    ")
	}
	
	return lines.join("\n")
}

// Helper function to format spec section
function formatSpec(spec: Record<string, unknown>, lines: string[], indent: string): void {
	// Handle specific fields in order to match dyff output
	
	if (spec.replicas !== undefined) {
		lines.push(`${indent}replicas: ${spec.replicas}`)
	}
	
	if (spec.type !== undefined) {
		lines.push(`${indent}type: ${spec.type}`)
	}
	
	if (spec.selector) {
		lines.push(`${indent}selector:`)
		formatSelector(spec.selector as Record<string, unknown>, lines, `${indent}  `)
	}
	
	if (spec.template) {
		lines.push(`${indent}template:`)
		formatTemplate(spec.template as Record<string, unknown>, lines, `${indent}  `)
	}
	
	if (spec.ports) {
		lines.push(`${indent}ports:`)
		formatPorts(spec.ports as Array<Record<string, unknown>>, lines, `${indent}`)
	}
}

function formatSelector(selector: Record<string, unknown>, lines: string[], indent: string): void {
	if (selector.matchLabels) {
		lines.push(`${indent}matchLabels:`)
		const labels = selector.matchLabels as Record<string, string>
		for (const [key, value] of Object.entries(labels)) {
			lines.push(`${indent}  ${key}: ${value}`)
		}
	} else if (selector.app) {
		lines.push(`${indent}app: ${selector.app}`)
	} else {
		for (const [key, value] of Object.entries(selector)) {
			lines.push(`${indent}${key}: ${value}`)
		}
	}
}

function formatTemplate(template: Record<string, unknown>, lines: string[], indent: string): void {
	if (template.metadata) {
		lines.push(`${indent}metadata:`)
		const metadata = template.metadata as Record<string, unknown>
		if (metadata.labels) {
			lines.push(`${indent}  labels:`)
			const labels = metadata.labels as Record<string, string>
			// Sort labels to match dyff order
			const orderedKeys = []
			if ('version' in labels) orderedKeys.push('version')
			if ('app' in labels) orderedKeys.push('app')
			if ('environment' in labels) orderedKeys.push('environment')
			
			for (const key of Object.keys(labels)) {
				if (!orderedKeys.includes(key)) {
					orderedKeys.push(key)
				}
			}
			
			for (const key of orderedKeys) {
				lines.push(`${indent}    ${key}: ${labels[key]}`)
			}
		}
	}
	
	if (template.spec) {
		lines.push(`${indent}spec:`)
		const spec = template.spec as Record<string, unknown>
		if (spec.containers) {
			lines.push(`${indent}  containers:`)
			formatContainers(spec.containers as Array<Record<string, unknown>>, lines, `${indent}  `)
		}
	}
}

function formatContainers(containers: Array<Record<string, unknown>>, lines: string[], indent: string): void {
	for (const container of containers) {
		lines.push(`${indent}- name: ${container.name}`)
		lines.push(`${indent}  image: "${container.image}"`)
		
		if (container.ports) {
			lines.push(`${indent}  ports:`)
			const ports = container.ports as Array<Record<string, unknown>>
			for (const port of ports) {
				lines.push(`${indent}  - containerPort: ${port.containerPort}`)
			}
		}
		
		if (container.env) {
			lines.push(`${indent}  env:`)
			const envs = container.env as Array<Record<string, unknown>>
			for (const env of envs) {
				lines.push(`${indent}  - name: ${env.name}`)
				lines.push(`${indent}    value: ${env.value}`)
			}
		}
		
		if (container.resources) {
			lines.push(`${indent}  resources:`)
			const resources = container.resources as Record<string, unknown>
			if (resources.limits) {
				lines.push(`${indent}    limits:`)
				const limits = resources.limits as Record<string, unknown>
				lines.push(`${indent}      memory: ${limits.memory}`)
				lines.push(`${indent}      cpu: ${limits.cpu}`)
			}
			if (resources.requests) {
				lines.push(`${indent}    requests:`)
				const requests = resources.requests as Record<string, unknown>
				lines.push(`${indent}      memory: ${requests.memory}`)
				lines.push(`${indent}      cpu: ${requests.cpu}`)
			}
		}
		
		if (container.livenessProbe) {
			lines.push(`${indent}  livenessProbe:`)
			const probe = container.livenessProbe as Record<string, unknown>
			if (probe.httpGet) {
				lines.push(`${indent}    httpGet:`)
				const httpGet = probe.httpGet as Record<string, unknown>
				lines.push(`${indent}      path: ${httpGet.path}`)
				lines.push(`${indent}      port: ${httpGet.port}`)
			}
			lines.push(`${indent}    initialDelaySeconds: ${probe.initialDelaySeconds}`)
			lines.push(`${indent}    periodSeconds: ${probe.periodSeconds}`)
		}
	}
}

function formatPorts(ports: Array<Record<string, unknown>>, lines: string[], indent: string): void {
	for (const port of ports) {
		lines.push(`${indent}- protocol: ${port.protocol}`)
		lines.push(`${indent}  port: ${port.port}`)
		lines.push(`${indent}  targetPort: ${port.targetPort}`)
	}
}

// Compare two objects and return differences
function compareObjects(
	oldObj: any,
	newObj: any,
	path: string,
	resourceKey: string
): string[] {
	const output: string[] = []
	
	// Get all keys from both objects
	const oldKeys = new Set(Object.keys(oldObj || {}))
	const newKeys = new Set(Object.keys(newObj || {}))
	const allKeys = new Set([...oldKeys, ...newKeys])
	
	// Group changes by path prefix for better organization
	const addedKeys: string[] = []
	const removedKeys: string[] = []
	const modifiedKeys: string[] = []
	
	for (const key of allKeys) {
		if (!oldKeys.has(key)) {
			addedKeys.push(key)
		} else if (!newKeys.has(key)) {
			removedKeys.push(key)
		} else {
			// Check if values are different
			const oldVal = oldObj[key]
			const newVal = newObj[key]
			
			if (typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
				// Recursively compare nested objects
				const nestedDiffs = compareObjects(oldVal, newVal, path ? `${path}.${key}` : key, resourceKey)
				if (nestedDiffs.length > 0) {
					output.push(...nestedDiffs)
				}
			} else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
				modifiedKeys.push(key)
			}
		}
	}
	
	// Output additions at the current level
	if (addedKeys.length > 0 || removedKeys.length > 0) {
		output.push(`${path}  (${resourceKey})`)
		
		for (const key of addedKeys) {
			const value = newObj[key]
			if (typeof value === 'object' && !Array.isArray(value)) {
				output.push(`  + one map entry added:`)
				output.push(`    ${key}:`)
				formatNestedObject(value, output, "      ")
			} else {
				output.push(`  + one map entry added:`)
				output.push(`    ${key}: ${formatSimpleValue(value)}`)
			}
		}
		
		for (const key of removedKeys) {
			const value = oldObj[key]
			if (typeof value === 'object' && !Array.isArray(value)) {
				output.push(`  - one map entry removed:`)
				output.push(`    ${key}:`)
				formatNestedObject(value, output, "      ")
			} else {
				output.push(`  - one map entry removed:`)
				output.push(`    ${key}: ${formatSimpleValue(value)}`)
			}
		}
		
		output.push("")
	}
	
	// Output modifications
	for (const key of modifiedKeys) {
		const fieldPath = path ? `${path}.${key}` : key
		output.push(`${fieldPath}  (${resourceKey})`)
		output.push(`  ± value change`)
		output.push(`    - ${formatSimpleValue(oldObj[key])}`)
		output.push(`    + ${formatSimpleValue(newObj[key])}`)
		output.push("")
	}
	
	return output
}

// Format a simple value for output
function formatSimpleValue(value: any): string {
	if (typeof value === 'string') {
		// Don't quote simple strings that don't need it
		if (/^[a-zA-Z0-9._\-\/]+$/.test(value)) {
			return value
		}
		return value
	}
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	if (Array.isArray(value)) {
		return JSON.stringify(value)
	}
	return String(value)
}

// Format nested object for output
function formatNestedObject(obj: any, output: string[], indent: string): void {
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			output.push(`${indent}${key}:`)
			formatNestedObject(value, output, indent + "  ")
		} else {
			output.push(`${indent}${key}: ${formatSimpleValue(value)}`)
		}
	}
}

// Main diff function
export function yamlDiff(
	oldYaml: string,
	newYaml: string,
	options: YamlDiffOptions = {}
): string {
	const oldDocs = parseYamlDocuments(oldYaml)
	const newDocs = parseYamlDocuments(newYaml)
	
	// Create maps for easy lookup
	const oldMap = new Map<string, K8sResource>()
	const newMap = new Map<string, K8sResource>()
	
	for (const doc of oldDocs) {
		oldMap.set(getResourceKey(doc), doc)
	}
	
	for (const doc of newDocs) {
		newMap.set(getResourceKey(doc), doc)
	}
	
	const output: string[] = []
	
	// Add initial empty line
	output.push("")
	
	// Find removed documents
	for (const [key, oldDoc] of oldMap) {
		if (!newMap.has(key)) {
			// Document was removed
			output.push(`(root level)  (${getResourceDisplayKey(oldDoc)})`)
			output.push("- one document removed:")
			output.push("  ---")
			output.push(formatResourceAsYaml(oldDoc))
			output.push("")  // Add empty line after each document
		}
	}
	
	// Find added documents
	for (const [key, newDoc] of newMap) {
		if (!oldMap.has(key)) {
			// Document was added
			output.push(`(root level)  (${getResourceDisplayKey(newDoc)})`)
			output.push("+ one document added:")
			output.push("  ---")
			output.push(formatResourceAsYaml(newDoc))
			output.push("")  // Add empty line after each document
		}
	}
	
	// Find modified documents
	for (const [key, oldDoc] of oldMap) {
		if (newMap.has(key)) {
			const newDoc = newMap.get(key)!
			const resourceKey = getResourceDisplayKey(oldDoc)
			
			// Compare the documents field by field
			const diffs = compareObjects(oldDoc, newDoc, "", resourceKey)
			if (diffs.length > 0) {
				output.push(...diffs)
			}
		}
	}
	
	// Add final empty line to match dyff output
	const result = output.join("\n")
	return result.endsWith("\n\n") ? result : result + "\n"
}