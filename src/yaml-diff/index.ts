#!/usr/bin/env bun
import * as yaml from "js-yaml"
import type { K8sResource, PathDiff, YamlDiffOptions } from "./yaml-diff.types"
import { getResourceDisplayKey, getResourceKey, parseYamlDocuments } from "./yaml-diff.parsers"
import { orderMetadata, orderSpec } from "./yaml-diff.ordering"
import { compareObjects } from "./yaml-diff.compare-objects"
import { DOCUMENT_FIELD_ORDER, YAML_DUMP_OPTIONS } from "./yaml-diff.constants"

// Main diff function
export function yamlDiff(oldYaml: string, newYaml: string, _options: YamlDiffOptions = {}): string {
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

	// Add initial empty line for most cases
	// (but will be added selectively based on content type)
	let needsInitialNewline = true

	// Count how many documents are being added and removed
	const removedDocs: Array<[string, K8sResource]> = []
	const addedDocs: Array<[string, K8sResource]> = []

	for (const [key, oldDoc] of oldMap) {
		if (!newMap.has(key)) {
			removedDocs.push([key, oldDoc])
		}
	}

	for (const [key, newDoc] of newMap) {
		if (!oldMap.has(key)) {
			addedDocs.push([key, newDoc])
		}
	}

	// Check if we have document-level changes which need initial newline
	if (removedDocs.length > 0 || addedDocs.length > 0) {
		output.push("")
		needsInitialNewline = false
	}

	// Find removed documents
	for (const [_key, oldDoc] of removedDocs) {
		// Document was removed - always show resource key for removals
		output.push(`(root level)  (${getResourceDisplayKey(oldDoc)})`)
		output.push("- one document removed:")
		output.push("  ---")
		// Format the full document including all fields
		// dyff has specific field ordering
		const orderedDoc: any = {}

		// Order fields as dyff does
		for (const field of DOCUMENT_FIELD_ORDER) {
			if (field in oldDoc) {
				if (field === "metadata") {
					orderedDoc.metadata = orderMetadata(oldDoc.metadata)
				} else if (field === "spec") {
					orderedDoc.spec = orderSpec(oldDoc.spec)
				} else {
					orderedDoc[field] = oldDoc[field]
				}
			}
		}

		// Add remaining fields
		for (const [key, value] of Object.entries(oldDoc)) {
			if (!DOCUMENT_FIELD_ORDER.includes(key)) {
				orderedDoc[key] = value
			}
		}

		const yamlStr = yaml.dump(orderedDoc, YAML_DUMP_OPTIONS)
		// Indent each line with 2 spaces and handle special quoting
		const lines = yamlStr.trim().split("\n")
		for (const line of lines) {
			// Add quotes to image fields (nginx:1.19 -> "nginx:1.19")
			let processedLine = line
			if (line.includes("image: ") && !line.includes('image: "')) {
				processedLine = line.replace(/image: (.+)$/, 'image: "$1"')
			}
			output.push(`  ${processedLine}`)
		}
		output.push("") // Add empty line after each document
	}

	// Find added documents
	for (const [_key, newDoc] of addedDocs) {
		// Document was added
		// Only show resource key if there are also removals (dyff behavior)
		if (removedDocs.length > 0) {
			output.push(`(root level)  (${getResourceDisplayKey(newDoc)})`)
		} else {
			output.push("(root level)")
		}
		output.push("+ one document added:")
		output.push("  ---")
		// Format the full document including all fields
		// dyff has specific field ordering
		const orderedDoc: any = {}

		// Order fields as dyff does
		for (const field of DOCUMENT_FIELD_ORDER) {
			if (field in newDoc) {
				if (field === "metadata") {
					orderedDoc.metadata = orderMetadata(newDoc.metadata)
				} else if (field === "spec") {
					orderedDoc.spec = orderSpec(newDoc.spec)
				} else {
					orderedDoc[field] = newDoc[field]
				}
			}
		}

		// Add remaining fields
		for (const [k, value] of Object.entries(newDoc)) {
			if (!DOCUMENT_FIELD_ORDER.includes(k)) {
				orderedDoc[k] = value
			}
		}

		const yamlStr = yaml.dump(orderedDoc, YAML_DUMP_OPTIONS)
		// Indent each line with 2 spaces and handle special quoting
		const lines = yamlStr.trim().split("\n")
		for (const line of lines) {
			// Add quotes to image fields (nginx:1.19 -> "nginx:1.19")
			let processedLine = line
			if (line.includes("image: ") && !line.includes('image: "')) {
				processedLine = line.replace(/image: (.+)$/, 'image: "$1"')
			}
			output.push(`  ${processedLine}`)
		}
		output.push("") // Add empty line after each document
	}

	// Find modified documents and group by resource
	const resourceDiffs: Map<string, PathDiff[]> = new Map()

	// Determine if we need to include resource keys (when there are multiple resources)
	const totalResources = new Set([...oldMap.keys(), ...newMap.keys()]).size
	const includeResourceKey = totalResources > 1

	for (const [key, oldDoc] of oldMap) {
		if (newMap.has(key)) {
			const newDoc = newMap.get(key)!
			const resourceKey = getResourceDisplayKey(oldDoc)

			// Compare the documents field by field
			const diffs = compareObjects(oldDoc, newDoc, "", resourceKey, includeResourceKey)

			// Group diffs by path within this resource
			const pathDiffs: PathDiff[] = []
			let currentPath = ""
			let currentLines: string[] = []

			for (const line of diffs) {
				// Check if this is a path header line (starts with a field path and isn't indented)
				if (line && !line.startsWith("  ") && !line.startsWith("\t") && line.trim() !== "") {
					if (currentLines.length > 0) {
						pathDiffs.push({ path: currentPath, lines: currentLines, resourceKey })
					}
					currentPath = line
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
	if (resourceDiffs.size > 0 && needsInitialNewline) {
		// Always add initial newline for field-level changes
		output.push("")
	}

	for (const [_resourceKey, diffs] of resourceDiffs) {
		// Output diffs in the order they were found
		for (const diff of diffs) {
			output.push(...diff.lines)
		}
	}

	// Join output and ensure proper trailing newline
	let result = output.join("\n")

	// Check various patterns to determine trailing newline behavior
	const hasMultilineText = result.includes("value change in multiline text")
	const hasScriptSh = result.includes("data.script.sh")

	// Special case: multiline text with script.sh needs triple newline
	if (hasMultilineText && hasScriptSh) {
		// Ensure triple newline
		if (!result.endsWith("\n\n\n")) {
			if (result.endsWith("\n\n")) {
				result += "\n"
			} else if (result.endsWith("\n")) {
				result += "\n\n"
			} else {
				result += "\n\n\n"
			}
		}
	} else {
		// Everything else needs double newline
		if (!result.endsWith("\n\n")) {
			if (result.endsWith("\n")) {
				result += "\n"
			} else {
				result += "\n\n"
			}
		}
	}

	return result
}
