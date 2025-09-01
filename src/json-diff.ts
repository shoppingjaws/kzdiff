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
	contextSize: number,
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

function compareResources(oldResource: K8sResource, newResource: K8sResource, contextSize: number): DiffResult[] {
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
				context: getContext(newFlat, key, contextSize),
			})
		} else if (!(key in newFlat)) {
			diffs.push({
				path: key,
				type: "removed",
				oldValue: oldFlat[key],
				context: getContext(oldFlat, key, contextSize),
			})
		} else if (JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key])) {
			diffs.push({
				path: key,
				type: "modified",
				oldValue: oldFlat[key],
				newValue: newFlat[key],
				context: getContext(newFlat, key, contextSize),
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

function formatContextItems(
	contexts: Array<{ key: string; value: FlatValue }>,
	diffPath: string,
	output: string[],
	baseIndent: string,
	diffs: DiffResult[],
	basePath: string | undefined,
	maxLines?: number,
): void {
	// Skip if no contexts
	if (contexts.length === 0) return

	const indent = "  "
	let linesUsed = 0
	const maxLinesToShow = maxLines || contexts.length

	// Get the parent path of the diff
	const diffSegments = diffPath.split(".")
	const diffParent = diffSegments.slice(0, -1).join(".")

	// Track which parent paths we've already shown
	const shownParents = new Set<string>()

	for (const ctx of contexts) {
		// Stop if we've reached the line limit
		if (linesUsed >= maxLinesToShow) break

		// Skip if this is another diff that will be shown separately
		if (diffs.some((d) => d.path === ctx.key)) {
			continue
		}

		// Get context segments
		const ctxSegments = ctx.key.split(".")
		const ctxParent = ctxSegments.slice(0, -1).join(".")

		// Check if this is a sibling (same parent)
		if (ctxParent === diffParent) {
			// Simple sibling - just show the key at the same level
			const lastSegment = ctxSegments[ctxSegments.length - 1] || ""
			// baseIndent already contains the correct absolute depth
			output.push(`  \x1b[90m${baseIndent}${lastSegment}: ${formatValue(ctx.value)}\x1b[0m`)
			linesUsed++
		} else {
			// Different parent - need to show hierarchy
			// Determine the display path based on relationship to basePath
			let displaySegments: string[]
			let _baseDepthOffset = 0

			if (basePath && ctx.key.startsWith(`${basePath}.`)) {
				// Context is within the group's basePath
				const relativePath = ctx.key.substring(basePath.length + 1)
				displaySegments = relativePath.split(".")
			} else {
				// Context is outside the group's basePath
				// Find common ancestor with basePath
				const commonPrefix = basePath ? getCommonPrefix(basePath, ctx.key) : ""

				if (commonPrefix) {
					// Show relative to common ancestor
					const relativePath = ctx.key.substring(commonPrefix.length + 1)
					displaySegments = relativePath.split(".")
					// Adjust depth based on common prefix
					_baseDepthOffset = -basePath!.split(".").length + commonPrefix.split(".").length + 1
				} else {
					// No common prefix, use full path
					displaySegments = ctx.key.split(".")
					_baseDepthOffset = -baseIndent.length / 2 + 2
				}
			}

			// Calculate how many lines this will take (parent paths + final value)
			let linesNeeded = 0
			let testPath = basePath || ""

			// Count lines needed for parent paths
			for (let i = 0; i < displaySegments.length - 1; i++) {
				const segment = displaySegments[i]
				if (segment) {
					testPath = testPath ? `${testPath}.${segment}` : segment
					if (!shownParents.has(testPath)) {
						linesNeeded++
					}
				}
			}
			// Plus one for the actual value
			linesNeeded++

			// Only show if we have enough lines left
			if (linesUsed + linesNeeded <= maxLinesToShow) {
				// Show parent hierarchy
				let currentPath = basePath || ""
				for (let i = 0; i < displaySegments.length - 1; i++) {
					const segment = displaySegments[i]
					if (segment) {
						currentPath = currentPath ? `${currentPath}.${segment}` : segment
						if (!shownParents.has(currentPath)) {
							// Use absolute depth calculation
							const absoluteDepth = currentPath.split(".").length
							const parentIndent = indent.repeat(absoluteDepth)
							output.push(`  \x1b[90m${parentIndent}${segment}:\x1b[0m`)
							shownParents.add(currentPath)
							linesUsed++
						}
					}
				}

				// Show the actual value
				const lastSegment = displaySegments[displaySegments.length - 1] || ""
				// Calculate absolute depth for the value
				const fullPath =
					basePath && ctx.key.startsWith(`${basePath}.`)
						? ctx.key
						: basePath
							? `${basePath}.${displaySegments.join(".")}`
							: displaySegments.join(".")
				const absoluteValueDepth = fullPath.split(".").filter((s) => s).length - 1
				const valueIndent = indent.repeat(Math.max(0, absoluteValueDepth))
				output.push(`  \x1b[90m${valueIndent}${lastSegment}: ${formatValue(ctx.value)}\x1b[0m`)
				linesUsed++
			}
		}
	}
}

function getCommonPrefix(path1: string, path2: string): string {
	const segments1 = path1.split(".")
	const segments2 = path2.split(".")
	const common: string[] = []

	for (let i = 0; i < Math.min(segments1.length, segments2.length); i++) {
		if (segments1[i] === segments2[i]) {
			common.push(segments1[i] as string)
		} else {
			break
		}
	}

	return common.join(".")
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

	// Calculate base depth from basePath
	const baseDepth = group.basePath ? group.basePath.split(".").length : 0

	// Render tree with proper indentation
	const renderTree = (node: TreeNode, depth: number = 0, parentPath: string = ""): void => {
		// Use absolute depth (basePath depth + relative depth)
		const nodeIndent = indent.repeat(baseDepth + depth)

		for (const [key, child] of node.children) {
			const fullPath = parentPath ? `${parentPath}.${key}` : key

			if (child.diff) {
				// This node has a diff
				const diff = child.diff

				// Show context before
				if (diff.context?.before.length) {
					// Pass context size (number of lines to show)
					const contextSize = diff.context.before.length
					formatContextItems(
						diff.context.before,
						diff.path,
						output,
						nodeIndent,
						group.diffs,
						group.basePath,
						contextSize,
					)
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
						output.push(`\x1b[31m- ${indent.repeat(baseDepth + depth + 1)}${formatValue(diff.oldValue)}\x1b[0m`)
						output.push(`\x1b[32m+ ${indent.repeat(baseDepth + depth + 1)}${formatValue(diff.newValue)}\x1b[0m`)
						break
				}

				// Show context after
				if (diff.context?.after.length) {
					// Pass context size (number of lines to show)
					const contextSize = diff.context.after.length
					formatContextItems(
						diff.context.after,
						diff.path,
						output,
						nodeIndent,
						group.diffs,
						group.basePath,
						contextSize,
					)
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

export function jsonDiff(oldContent: string, newContent: string, contextSize = 2): string {
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
			const diffs = compareResources(oldResource, newResource, contextSize)
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
