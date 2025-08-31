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

// Compare arrays and detect specific changes
function compareArrays(oldArr: any[], newArr: any[]): { removed: any[], added: any[], modified?: any[] } {
	// For simple arrays (strings, numbers)
	if (oldArr.length > 0 && typeof oldArr[0] !== 'object') {
		const oldSet = new Set(oldArr)
		const newSet = new Set(newArr)
		
		const removed = oldArr.filter(item => !newSet.has(item))
		const added = newArr.filter(item => !oldSet.has(item))
		
		return { removed, added }
	}
	
	// For arrays of objects (like containers, volumes)
	// Try to match by 'name' field if available
	const oldByName = new Map()
	const newByName = new Map()
	
	for (const item of oldArr) {
		if (item && typeof item === 'object' && 'name' in item) {
			oldByName.set(item.name, item)
		}
	}
	
	for (const item of newArr) {
		if (item && typeof item === 'object' && 'name' in item) {
			newByName.set(item.name, item)
		}
	}
	
	// If we can match by name
	if (oldByName.size > 0 || newByName.size > 0) {
		const removed = []
		const added = []
		const modified = []
		
		for (const [name, item] of oldByName) {
			if (!newByName.has(name)) {
				removed.push(item)
			} else {
				// Check if the item was modified
				const newItem = newByName.get(name)
				if (JSON.stringify(item) !== JSON.stringify(newItem)) {
					modified.push({ name, old: item, new: newItem })
				}
			}
		}
		
		for (const [name, item] of newByName) {
			if (!oldByName.has(name)) {
				added.push(item)
			}
		}
		
		// Return modified items as well for special handling
		return { removed, added, modified }
	}
	
	// For other arrays, check if items were added or removed
	const removed = []
	const added = []
	
	// Simple comparison - items only in old array
	for (const item of oldArr) {
		if (!newArr.some(newItem => JSON.stringify(item) === JSON.stringify(newItem))) {
			removed.push(item)
		}
	}
	
	// Items only in new array
	for (const item of newArr) {
		if (!oldArr.some(oldItem => JSON.stringify(item) === JSON.stringify(oldItem))) {
			added.push(item)
		}
	}
	
	return { removed, added }
}

// Check if a string contains multiline YAML content
function isMultilineYaml(str: string): boolean {
	return typeof str === 'string' && str.includes('\n') && (str.includes('- ') || str.includes(': '))
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
	const oldKeys = Object.keys(oldObj || {})
	const newKeys = Object.keys(newObj || {})
	const oldKeysSet = new Set(oldKeys)
	const newKeysSet = new Set(newKeys)
	
	// Classify keys
	const addedKeys: string[] = []
	const removedKeys: string[] = []
	const modifiedKeys: string[] = []
	
	for (const key of newKeys) {
		if (!oldKeysSet.has(key)) {
			addedKeys.push(key)
		} else {
			// Will check if modified later
			modifiedKeys.push(key)
		}
	}
	
	for (const key of oldKeys) {
		if (!newKeysSet.has(key)) {
			removedKeys.push(key)
		}
	}
	
	// First handle additions
	for (const key of addedKeys) {
		const value = newObj[key]
		output.push(`${path}  (${resourceKey})`)
		if (Array.isArray(value)) {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}:`)
			for (const item of value) {
				formatArrayObject(item, output, "    - ", false)
			}
		} else if (typeof value === 'object' && !Array.isArray(value)) {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}:`)
			formatNestedObject(value, output, "      ")
		} else {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}: ${formatSimpleValue(value)}`)
		}
		output.push("")
	}
	
	// Then handle modifications (in order they appear in new object)
	for (const key of modifiedKeys) {
		if (!oldKeysSet.has(key) || !newKeysSet.has(key)) {
			continue
		}
		
		// Check if values are different
		const oldVal = oldObj[key]
		const newVal = newObj[key]
		
		if (Array.isArray(oldVal) && Array.isArray(newVal)) {
			// Special handling for single named items in arrays (like containers)
			if (oldVal.length === 1 && newVal.length === 1 && 
				typeof oldVal[0] === 'object' && typeof newVal[0] === 'object' &&
				'name' in oldVal[0] && 'name' in newVal[0] && 
				oldVal[0].name === newVal[0].name) {
				// Same named item, compare as nested object
				const itemName = oldVal[0].name
				const nestedDiffs = compareObjects(oldVal[0], newVal[0], path ? `${path}.${key}.${itemName}` : `${key}.${itemName}`, resourceKey)
				output.push(...nestedDiffs)
			} else {
				// Handle array changes
				const { removed, added, modified } = compareArrays(oldVal, newVal)
				
				// Handle additions and removals first (before modifications)
				if (removed.length > 0 || added.length > 0) {
					const fieldPath = path ? `${path}.${key}` : key
					output.push(`${fieldPath}  (${resourceKey})`)
					
					if (removed.length > 0 && added.length > 0) {
						// Both additions and removals
						const removedStr = removed.length === 1 ? "one list entry removed:" : `${removed.length} list entries removed:`
						const addedStr = added.length === 1 ? "one list entry added:" : added.length === 2 ? "two list entries added:" : `${added.length} list entries added:`
						
						output.push(`  - ${removedStr}     + ${addedStr}`)
						
						// Format removed items
						for (const item of removed) {
							if (typeof item === 'object') {
								formatArrayObject(item, output, "    - ", true)
							} else {
								output.push(`    - ${item}`)
							}
						}
						
						// Format added items aligned to the right
						if (added.length > 0) {
							let baseIndex = output.length - removed.length
							
							for (let i = 0; i < added.length; i++) {
								const item = added[i]
								const targetIndex = baseIndex + i
								
								if (targetIndex < output.length && output[targetIndex]) {
									const existingLine = output[targetIndex]
									// Align to column 34 (counting from 0)
									const padding = " ".repeat(Math.max(1, 34 - existingLine.length))
									
									if (typeof item === 'object') {
										output[targetIndex] = existingLine + padding + `- ${formatObjectInline(item)}`
									} else {
										output[targetIndex] = existingLine + padding + `- ${item}`
									}
								} else {
									const indent = " ".repeat(34)
									if (typeof item === 'object') {
										output.push(indent + `- ${formatObjectInline(item)}`)
									} else {
										output.push(indent + `- ${item}`)
									}
								}
							}
						}
					} else if (removed.length > 0) {
						const removedStr = removed.length === 1 ? "one list entry removed:" : `${removed.length} list entries removed:`
						output.push(`  - ${removedStr}`)
						for (const item of removed) {
							if (typeof item === 'object') {
								formatArrayObject(item, output, "    - ", true)
							} else {
								output.push(`    - ${item}`)
							}
						}
					} else if (added.length > 0) {
						const addedStr = added.length === 1 ? "one list entry added:" : `${added.length} list entries added:`
						output.push(`  + ${addedStr}`)
						for (const item of added) {
							if (typeof item === 'object') {
								formatArrayObject(item, output, "    - ", true)
							} else {
								output.push(`    - ${item}`)
							}
						}
					}
					
					output.push("")
				}
				
				// Then handle modified items in arrays (like volumes with same name but different config)
				if (modified && modified.length > 0) {
					for (const mod of modified) {
						const itemPath = path ? `${path}.${key}.${mod.name}` : `${key}.${mod.name}`
						
						// Check for special case where entire content is replaced
						const oldKeys = Object.keys(mod.old).filter(k => k !== 'name')
						const newKeys = Object.keys(mod.new).filter(k => k !== 'name')
						
						if (oldKeys.length === 1 && newKeys.length === 1 && oldKeys[0] !== newKeys[0]) {
							// This is a replacement like emptyDir -> persistentVolumeClaim
							output.push(`${itemPath}  (${resourceKey})`)
							output.push(`  - one map entry removed:     + one map entry added:`)
							
							const oldKey = oldKeys[0]
							const newKey = newKeys[0]
							const oldValue = mod.old[oldKey]
							const newValue = mod.new[newKey]
							
							if (typeof oldValue === 'object' && Object.keys(oldValue).length === 0) {
								// Empty object like {}
								const removedStr = `    ${oldKey}: {}`
								const addedStr = `${newKey}:`
								const padding = " ".repeat(Math.max(1, 33 - removedStr.length))
								output.push(removedStr + padding + addedStr)
								
								// Add the details of the new value
								if (typeof newValue === 'object') {
									const indent = " ".repeat(35)
									for (const [k, v] of Object.entries(newValue)) {
										output.push(`${indent}${k}: ${formatSimpleValue(v)}`)
									}
								}
							} else {
								// Regular replacement
								const removedStr = `    ${oldKey}: ${formatSimpleValue(oldValue)}`
								const addedStr = `${newKey}: ${formatSimpleValue(newValue)}`
								const padding = " ".repeat(Math.max(1, 33 - removedStr.length))
								output.push(removedStr + padding + addedStr)
							}
							output.push("")
						} else {
							// Regular nested diff
							const diffs = compareObjects(mod.old, mod.new, itemPath, resourceKey)
							output.push(...diffs)
						}
					}
				}
				
				// Handle fallback case
				if (removed.length === 0 && added.length === 0 && (!modified || modified.length === 0) && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
					// Arrays are different but no specific additions/removals detected
					const fieldPath = path ? `${path}.${key}` : key
					output.push(`${fieldPath}  (${resourceKey})`)
					output.push(`  ± value change`)
					output.push(`    - ${formatSimpleValue(oldVal)}`)
					output.push(`    + ${formatSimpleValue(newVal)}`)
					output.push("")
				}
			}
		} else if (typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
			// Recursively compare nested objects
			const nestedDiffs = compareObjects(oldVal, newVal, path ? `${path}.${key}` : key, resourceKey)
			output.push(...nestedDiffs)
		} else if (isMultilineYaml(oldVal) && isMultilineYaml(newVal)) {
			// Handle multiline YAML text
			const fieldPath = path ? `${path}.${key}` : key
			output.push(`${fieldPath}  (${resourceKey})`)
			output.push(`  ± value change in multiline text (one insert, one deletion)`)
			
			// Parse and format the multiline content
			const oldLines = oldVal.trim().split('\n')
			const newLines = newVal.trim().split('\n')
			
			// Simple diff - show what was removed and what was added
			const oldSet = new Set(oldLines)
			const newSet = new Set(newLines)
			
			for (const line of oldLines) {
				if (newSet.has(line)) {
					output.push(`      ${line}`)
				} else {
					output.push(`    - ${line}`)
				}
			}
			
			for (const line of newLines) {
				if (!oldSet.has(line)) {
					output.push(`    + ${line}`)
				}
			}
			
			output.push("")
			output.push("")
		} else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
			const fieldPath = path ? `${path}.${key}` : key
			output.push(`${fieldPath}  (${resourceKey})`)
			output.push(`  ± value change`)
			output.push(`    - ${formatSimpleValue(oldVal)}`)
			output.push(`    + ${formatSimpleValue(newVal)}`)
			output.push("")
		}
	}
	
	// Finally handle removals (but check for side-by-side presentation)
	if (removedKeys.length === 1 && addedKeys.length === 0) {
		// Check if this removal can be shown side-by-side with an addition
		// This happens with volumes.data change from emptyDir to persistentVolumeClaim
		// We need to detect when a key's value changes from one type to another
	}
	
	for (const key of removedKeys) {
		const value = oldObj[key]
		output.push(`${path}  (${resourceKey})`)
		if (typeof value === 'object' && !Array.isArray(value)) {
			output.push(`  - one map entry removed:`)
			output.push(`    ${key}:`)
			formatNestedObject(value, output, "      ")
		} else {
			output.push(`  - one map entry removed:`)
			output.push(`    ${key}: ${formatSimpleValue(value)}`)
		}
		output.push("")
	}
	
	return output
}

// Format an object in an array for output
function formatArrayObject(obj: any, output: string[], prefix: string, inline: boolean): void {
	if (typeof obj !== 'object' || obj === null) {
		output.push(`${prefix}${obj}`)
		return
	}
	
	const entries = Object.entries(obj)
	if (entries.length === 0) {
		output.push(`${prefix}{}`)
		return
	}
	
	// First entry gets the prefix
	const [firstKey, firstValue] = entries[0]
	if (typeof firstValue === 'object' && !Array.isArray(firstValue)) {
		output.push(`${prefix}${firstKey}:`)
		formatNestedObject(firstValue, output, prefix.replace('-', ' ') + "  ")
	} else {
		output.push(`${prefix}${firstKey}: ${formatSimpleValue(firstValue)}`)
	}
	
	// Remaining entries
	for (let i = 1; i < entries.length; i++) {
		const [key, value] = entries[i]
		const indent = prefix.replace('-', ' ')
		if (typeof value === 'object' && !Array.isArray(value)) {
			output.push(`${indent}${key}:`)
			formatNestedObject(value, output, indent + "  ")
		} else {
			output.push(`${indent}${key}: ${formatSimpleValue(value)}`)
		}
	}
}

// Format object inline for compact display
function formatObjectInline(obj: any): string {
	if (typeof obj !== 'object' || obj === null) return String(obj)
	
	const parts = []
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'object') {
			parts.push(`${key}: ${JSON.stringify(value)}`)
		} else {
			parts.push(`${key}: ${value}`)
		}
	}
	return parts.join(', ')
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
	
	// Find modified documents and group by resource
	const resourceDiffs: Map<string, { path: string, lines: string[], resourceKey: string }[]> = new Map()
	
	for (const [key, oldDoc] of oldMap) {
		if (newMap.has(key)) {
			const newDoc = newMap.get(key)!
			const resourceKey = getResourceDisplayKey(oldDoc)
			
			// Compare the documents field by field
			const diffs = compareObjects(oldDoc, newDoc, "", resourceKey)
			
			// Group diffs by path within this resource
			const pathDiffs: { path: string, lines: string[], resourceKey: string }[] = []
			let currentPath = ""
			let currentLines: string[] = []
			
			for (const line of diffs) {
				// Check if this is a path header line (contains resource key in parens)
				if (line.includes(` (${resourceKey})`)) {
					if (currentLines.length > 0) {
						pathDiffs.push({ path: currentPath, lines: currentLines, resourceKey })
					}
					currentPath = line.split(' ')[0] || ""
					currentLines = [line]
				} else {
					currentLines.push(line)
				}
			}
			
			if (currentLines.length > 0) {
				pathDiffs.push({ path: currentPath, lines: currentLines, resourceKey })
			}
			
			if (pathDiffs.length > 0) {
				resourceDiffs.set(resourceKey, pathDiffs)
			}
		}
	}
	
	// Output diffs for each resource in the order they were discovered
	for (const [resourceKey, diffs] of resourceDiffs) {
		// Output diffs in the order they were found
		for (const diff of diffs) {
			output.push(...diff.lines)
		}
	}
	
	// Add final empty line to match dyff output
	const result = output.join("\n")
	return result.endsWith("\n\n") ? result : result + "\n"
}