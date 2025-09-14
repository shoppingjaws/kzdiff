#!/usr/bin/env bun
import * as yaml from "js-yaml"
import { createDebugLogger } from "./debug"

const debugLog = createDebugLogger("json-diff")

// Define types for YAML values
type YamlValue = string | number | boolean | null | undefined | YamlValue[] | { [key: string]: YamlValue }
type FlatValue = string | number | boolean | null | undefined

interface DiffResult {
	path: string
	type: "added" | "removed" | "modified"
	oldValue?: FlatValue
	newValue?: FlatValue
	context?: {
		before: Array<{ key: string; value: FlatValue }>
		after: Array<{ key: string; value: FlatValue }>
	}
}

interface K8sResource {
	kind?: string
	apiVersion?: string
	metadata?: {
		name?: string
		namespace?: string
	}
	[key: string]: YamlValue
}

interface DiffGroup {
	basePath: string
	diffs: DiffResult[]
}

function parseYAML(content: string): K8sResource[] {
	if (!content.trim()) return []

	try {
		const docs = yaml.loadAll(content) as unknown[]
		return docs.filter((doc): doc is K8sResource => doc !== null && typeof doc === "object")
	} catch (error) {
		debugLog(`Error parsing YAML: ${error}`)
		return []
	}
}

function getResourceKey(resource: K8sResource): string {
	const kind = resource.kind || "Unknown"
	const apiVersion = resource.apiVersion || ""
	const name = resource.metadata?.name || "unnamed"
	const namespace = resource.metadata?.namespace || ""

	return namespace ? `${kind}/${apiVersion}/${namespace}/${name}` : `${kind}/${apiVersion}/${name}`
}

function flattenObject(obj: YamlValue, prefix = "", result: Record<string, FlatValue> = {}): Record<string, FlatValue> {
	if (obj === null || obj === undefined) {
		result[prefix] = obj
		return result
	}

	if (Array.isArray(obj)) {
		obj.forEach((item, index) => {
			const key = prefix ? `${prefix}[${index}]` : `[${index}]`
			if (typeof item === "object" && item !== null) {
				flattenObject(item, key, result)
			} else {
				result[key] = item
			}
		})
	} else if (typeof obj === "object") {
		Object.keys(obj).forEach((key) => {
			const newKey = prefix ? `${prefix}.${key}` : key
			if (typeof obj[key] === "object" && obj[key] !== null) {
				flattenObject(obj[key], newKey, result)
			} else {
				result[newKey] = obj[key]
			}
		})
	} else {
		result[prefix] = obj
	}

	return result
}

function getContext(
	flatObj: Record<string, FlatValue>,
	path: string,
	contextSize = 2,
): {
	before: Array<{ key: string; value: FlatValue }>
	after: Array<{ key: string; value: FlatValue }>
} {
	const keys = Object.keys(flatObj).sort()
	const index = keys.indexOf(path)

	const before: Array<{ key: string; value: FlatValue }> = []
	const after: Array<{ key: string; value: FlatValue }> = []

	for (let i = Math.max(0, index - contextSize); i < index; i++) {
		const key = keys[i]
		if (key !== undefined) {
			const value = flatObj[key]
			if (value !== undefined) {
				before.push({ key, value })
			}
		}
	}

	for (let i = index + 1; i <= Math.min(keys.length - 1, index + contextSize); i++) {
		const key = keys[i]
		if (key !== undefined) {
			const value = flatObj[key]
			if (value !== undefined) {
				after.push({ key, value })
			}
		}
	}

	return { before, after }
}

function compareResources(oldResource: K8sResource, newResource: K8sResource): DiffResult[] {
	const diffs: DiffResult[] = []
	const oldFlat = flattenObject(oldResource)
	const newFlat = flattenObject(newResource)

	const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])

	for (const key of allKeys) {
		if (!(key in oldFlat)) {
			diffs.push({
				path: key,
				type: "added",
				newValue: newFlat[key],
				context: getContext(newFlat, key),
			})
		} else if (!(key in newFlat)) {
			diffs.push({
				path: key,
				type: "removed",
				oldValue: oldFlat[key],
				context: getContext(oldFlat, key),
			})
		} else if (JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key])) {
			diffs.push({
				path: key,
				type: "modified",
				oldValue: oldFlat[key],
				newValue: newFlat[key],
				context: getContext(newFlat, key),
			})
		}
	}

	return diffs
}

function formatValue(value: FlatValue, indent = ""): string {
	if (value === null) return "null"
	if (value === undefined) return "undefined"
	if (typeof value === "string") {
		if (value.includes("\n")) {
			return `|\n${value
				.split("\n")
				.map((line) => `${indent}  ${line}`)
				.join("\n")}`
		}
		return value.includes(" ") || value === "" ? `"${value}"` : value
	}
	return String(value)
}

function groupDiffs(diffs: DiffResult[]): DiffGroup[] {
	if (diffs.length === 0) return []

	// Sort diffs by path to process them in order
	const sortedDiffs = [...diffs].sort((a, b) => a.path.localeCompare(b.path))

	// Group diffs based on path hierarchy and proximity
	const groups: DiffGroup[] = []
	let currentGroup: DiffResult[] = []

	for (let i = 0; i < sortedDiffs.length; i++) {
		const diff = sortedDiffs[i]
		if (!diff) continue

		if (currentGroup.length === 0) {
			// Start new group
			currentGroup.push(diff)
		} else {
			// Determine if this diff should be in the same group
			const shouldGroup = shouldGroupTogether(currentGroup, diff)

			if (shouldGroup) {
				currentGroup.push(diff)
			} else {
				// Save current group and start new one
				const basePath = findOptimalBasePath(currentGroup.map((d) => d.path))
				groups.push({ basePath, diffs: currentGroup })
				currentGroup = [diff]
			}
		}
	}

	// Don't forget the last group
	if (currentGroup.length > 0) {
		const basePath = findOptimalBasePath(currentGroup.map((d) => d.path))
		groups.push({ basePath, diffs: currentGroup })
	}

	return groups
}

function shouldGroupTogether(currentGroup: DiffResult[], newDiff: DiffResult): boolean {
	// Get the paths
	const lastDiff = currentGroup[currentGroup.length - 1]
	if (!lastDiff) return false

	const lastParts = lastDiff.path.split(".")
	const newParts = newDiff.path.split(".")

	// Check if they're siblings (same immediate parent)
	const lastParent = lastParts.slice(0, -1).join(".")
	const newParent = newParts.slice(0, -1).join(".")

	if (lastParent === newParent) {
		// Same immediate parent - group together
		return true
	}

	// Check path depth difference
	const depthDiff = Math.abs(lastParts.length - newParts.length)

	// If depth difference is more than 2, don't group
	if (depthDiff > 2) {
		return false
	}

	// Check if one is a descendant of the other's parent
	const lastGrandParent = lastParts.slice(0, -2).join(".")
	const newGrandParent = newParts.slice(0, -2).join(".")

	// If they share a grandparent and are at similar depth, consider grouping
	if (lastGrandParent === newGrandParent && depthDiff <= 1) {
		// Check if there are intermediate fields between them
		// This is a simple heuristic - if paths are too different, separate them
		const lastField = lastParts[lastParts.length - 1]
		const newField = newParts[newParts.length - 1]

		// If the fields are very different (e.g., one is array index, other is not), separate
		const lastIsArray = lastField?.includes("[") ?? false
		const newIsArray = newField?.includes("[") ?? false

		if (lastIsArray !== newIsArray) {
			return false
		}

		return true
	}

	// Default: don't group
	return false
}

function findOptimalBasePath(paths: string[]): string {
	if (paths.length === 0) return ""
	if (paths.length === 1) {
		// For single path, use parent
		const firstPath = paths[0]
		if (!firstPath) return ""
		const parts = firstPath.split(".")
		return parts.length > 1 ? parts.slice(0, -1).join(".") : ""
	}

	// Find common ancestor
	const splitPaths = paths.map((p) => p.split("."))
	const minLength = Math.min(...splitPaths.map((p) => p.length))

	const commonParts: string[] = []
	const firstPath = splitPaths[0]
	if (!firstPath) return ""

	for (let i = 0; i < minLength; i++) {
		const part = firstPath[i]
		if (part && splitPaths.every((p) => p[i] === part)) {
			commonParts.push(part)
		} else {
			break
		}
	}

	// If common ancestor is too shallow and all paths share a deeper common parent, use that
	if (commonParts.length < minLength - 1) {
		// Check if all paths have the same parent (one level up from the field)
		const parents = paths.map((p) => {
			const parts = p.split(".")
			return parts.slice(0, -1).join(".")
		})

		const uniqueParents = [...new Set(parents)]
		if (uniqueParents.length === 1) {
			const firstParent = uniqueParents[0]
			return firstParent ?? ""
		}
	}

	return commonParts.join(".")
}

function formatGroupedDiff(group: DiffGroup): string {
	const output: string[] = []
	const indent = "  "

	// Show the base path as a section header
	output.push(`  \x1b[36m@ ${group.basePath || "root"}\x1b[0m`)

	// Build a tree structure from the diffs
	interface TreeNode {
		path: string
		diff?: DiffResult
		children: Map<string, TreeNode>
	}

	const root: TreeNode = { path: "", children: new Map() }

	// Build tree from diffs
	for (const diff of group.diffs) {
		const relativePath = group.basePath ? diff.path.substring(group.basePath.length + 1) : diff.path

		const parts = relativePath.split(".")
		let current = root

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]
			if (!part) continue

			if (!current.children.has(part)) {
				current.children.set(part, {
					path: parts.slice(0, i + 1).join("."),
					children: new Map(),
				})
			}
			const child = current.children.get(part)
			if (!child) {
				throw new Error(`Unexpected missing child node for part: ${part}`)
			}
			current = child
		}

		current.diff = diff
	}

	// Render tree with proper indentation
	const renderTree = (node: TreeNode, depth: number = 0, parentPath: string = ""): void => {
		const nodeIndent = indent.repeat(depth + 2)

		for (const [key, child] of node.children) {
			const fullPath = parentPath ? `${parentPath}.${key}` : key

			if (child.diff) {
				// This node has a diff
				const diff = child.diff

				// Show context before
				if (diff.context?.before.length) {
					for (const ctx of diff.context.before) {
						// Only show context items that are siblings of the current diff
						const ctxParts = ctx.key.split(".")
						const diffParts = diff.path.split(".")

						// Check if they're siblings (same parent, same depth)
						if (ctxParts.length === diffParts.length) {
							const ctxParent = ctxParts.slice(0, -1).join(".")
							const diffParent = diffParts.slice(0, -1).join(".")

							if (ctxParent === diffParent) {
								const ctxKey = ctxParts[ctxParts.length - 1]
								// Skip if this is another diff
								if (ctxKey && !group.diffs.some((d) => d.path === ctx.key)) {
									output.push(`  \x1b[90m${nodeIndent}${ctxKey}: ${formatValue(ctx.value)}\x1b[0m`)
								}
							}
						}
					}
				}

				// Show the diff
				switch (diff.type) {
					case "added":
						output.push(`\x1b[32m+ ${nodeIndent}${key}: ${formatValue(diff.newValue)}\x1b[0m`)
						break
					case "removed":
						output.push(`\x1b[31m- ${nodeIndent}${key}: ${formatValue(diff.oldValue)}\x1b[0m`)
						break
					case "modified":
						output.push(`  ${nodeIndent}${key}:`)
						output.push(`\x1b[31m- ${indent.repeat(depth + 3)}${formatValue(diff.oldValue)}\x1b[0m`)
						output.push(`\x1b[32m+ ${indent.repeat(depth + 3)}${formatValue(diff.newValue)}\x1b[0m`)
						break
				}

				// Show context after
				if (diff.context?.after.length) {
					for (const ctx of diff.context.after) {
						// Only show context items that are siblings of the current diff
						const ctxParts = ctx.key.split(".")
						const diffParts = diff.path.split(".")

						// Check if they're siblings (same parent, same depth)
						if (ctxParts.length === diffParts.length) {
							const ctxParent = ctxParts.slice(0, -1).join(".")
							const diffParent = diffParts.slice(0, -1).join(".")

							if (ctxParent === diffParent) {
								const ctxKey = ctxParts[ctxParts.length - 1]
								// Skip if this is another diff
								if (ctxKey && !group.diffs.some((d) => d.path === ctx.key)) {
									output.push(`  \x1b[90m${nodeIndent}${ctxKey}: ${formatValue(ctx.value)}\x1b[0m`)
								}
							}
						}
					}
				}
			} else if (child.children.size > 0) {
				// This is an intermediate node with children
				output.push(`  ${nodeIndent}${key}:`)
				renderTree(child, depth + 1, fullPath)
			}
		}
	}

	renderTree(root)
	output.push("")
	return output.join("\n")
}

function formatDiff(resource: K8sResource, diffs: DiffResult[]): string {
	if (diffs.length === 0) return ""

	const output: string[] = []
	const kind = resource.kind || "Unknown"
	const apiVersion = resource.apiVersion || ""
	const name = resource.metadata?.name || "unnamed"
	const namespace = resource.metadata?.namespace

	output.push(`\x1b[1m${"─".repeat(80)}\x1b[0m`)
	output.push(`\x1b[1m● ${kind}\x1b[0m (${apiVersion})`)
	if (namespace) {
		output.push(`  \x1b[36mnamespace:\x1b[0m ${namespace}`)
	}
	output.push(`  \x1b[36mname:\x1b[0m ${name}`)
	output.push("")

	// Group diffs by common path prefix
	const groups = groupDiffs(diffs)

	// Format each group
	for (const group of groups) {
		output.push(formatGroupedDiff(group))
	}

	return output.join("\n")
}

export function jsonDiff(oldContent: string, newContent: string): string {
	const oldResources = parseYAML(oldContent)
	const newResources = parseYAML(newContent)

	const oldMap = new Map<string, K8sResource>()
	const newMap = new Map<string, K8sResource>()

	for (const resource of oldResources) {
		oldMap.set(getResourceKey(resource), resource)
	}

	for (const resource of newResources) {
		newMap.set(getResourceKey(resource), resource)
	}

	const allKeys = new Set([...oldMap.keys(), ...newMap.keys()])
	const output: string[] = []

	let hasChanges = false

	for (const key of allKeys) {
		const oldResource = oldMap.get(key)
		const newResource = newMap.get(key)

		if (!oldResource && newResource) {
			hasChanges = true
			output.push(`\x1b[1m${"─".repeat(80)}\x1b[0m`)
			output.push(`\x1b[32m● ${newResource.kind} (ADDED)\x1b[0m ${newResource.apiVersion || ""}`)
			if (newResource.metadata?.namespace) {
				output.push(`  \x1b[36mnamespace:\x1b[0m ${newResource.metadata.namespace}`)
			}
			output.push(`  \x1b[36mname:\x1b[0m ${newResource.metadata?.name || "unnamed"}`)
			output.push("")
		} else if (oldResource && !newResource) {
			hasChanges = true
			output.push(`\x1b[1m${"─".repeat(80)}\x1b[0m`)
			output.push(`\x1b[31m● ${oldResource.kind} (REMOVED)\x1b[0m ${oldResource.apiVersion || ""}`)
			if (oldResource.metadata?.namespace) {
				output.push(`  \x1b[36mnamespace:\x1b[0m ${oldResource.metadata.namespace}`)
			}
			output.push(`  \x1b[36mname:\x1b[0m ${oldResource.metadata?.name || "unnamed"}`)
			output.push("")
		} else if (oldResource && newResource) {
			const diffs = compareResources(oldResource, newResource)
			if (diffs.length > 0) {
				hasChanges = true
				output.push(formatDiff(newResource, diffs))
			}
		}
	}

	if (!hasChanges) {
		return "\x1b[90mNo differences found\x1b[0m\n"
	}

	return output.join("\n")
}
