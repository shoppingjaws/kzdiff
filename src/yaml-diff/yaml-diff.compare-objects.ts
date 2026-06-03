import { COLUMN_ALIGNMENT } from "./yaml-diff.constants"
import { compareArrays } from "./yaml-diff.comparators"
import { formatArrayObject, formatNestedObject, formatObjectInline, formatSimpleValue } from "./yaml-diff.formatters"
import { handleMultilineTextDiff, handleSimpleMultilineTextDiff, isMultilineYaml } from "./yaml-diff.multiline"

// Compare two objects and return differences
export function compareObjects(
	oldObj: any,
	newObj: any,
	path: string,
	resourceKey: string,
	includeResourceKey: boolean = false,
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
	handleAddedKeys(addedKeys, newObj, path, resourceKey, includeResourceKey, output)

	// Then handle modifications (in order they appear in new object)
	handleModifiedKeys(
		modifiedKeys,
		oldObj,
		newObj,
		oldKeysSet,
		newKeysSet,
		path,
		resourceKey,
		includeResourceKey,
		output,
	)

	// Finally handle removals (but check for side-by-side presentation)
	handleRemovedKeys(removedKeys, oldObj, path, resourceKey, includeResourceKey, output)

	return output
}

function handleAddedKeys(
	addedKeys: string[],
	newObj: any,
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	for (const key of addedKeys) {
		const value = newObj[key]
		output.push(includeResourceKey && resourceKey ? `${path}  (${resourceKey})` : `${path}`)
		if (Array.isArray(value)) {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}:`)
			for (const item of value) {
				formatArrayObject(item, output, "    - ", false)
			}
		} else if (typeof value === "object" && !Array.isArray(value)) {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}:`)
			formatNestedObject(value, output, "      ")
		} else {
			output.push(`  + one map entry added:`)
			output.push(`    ${key}: ${formatSimpleValue(value)}`)
		}
		output.push("")
	}
}

function handleModifiedKeys(
	modifiedKeys: string[],
	oldObj: any,
	newObj: any,
	oldKeysSet: Set<string>,
	newKeysSet: Set<string>,
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	for (const key of modifiedKeys) {
		if (!oldKeysSet.has(key) || !newKeysSet.has(key)) {
			continue
		}

		// Check if values are different
		const oldVal = oldObj[key]
		const newVal = newObj[key]

		if (Array.isArray(oldVal) && Array.isArray(newVal)) {
			handleArrayChanges(key, oldVal, newVal, path, resourceKey, includeResourceKey, output)
		} else if (
			typeof oldVal === "object" &&
			typeof newVal === "object" &&
			!Array.isArray(oldVal) &&
			!Array.isArray(newVal)
		) {
			// Recursively compare nested objects
			const nestedDiffs = compareObjects(oldVal, newVal, path ? `${path}.${key}` : key, resourceKey, includeResourceKey)
			output.push(...nestedDiffs)
		} else if (isMultilineYaml(oldVal) && isMultilineYaml(newVal)) {
			if (oldVal === newVal) {
				continue
			}
			const fieldPath = path ? `${path}.${key}` : key
			handleMultilineTextDiff(oldVal, newVal, fieldPath, resourceKey, includeResourceKey, output)
		} else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
			const fieldPath = path ? `${path}.${key}` : key
			output.push(includeResourceKey && resourceKey ? `${fieldPath}  (${resourceKey})` : `${fieldPath}`)
			output.push(`  ± value change`)

			// Check if values are multiline strings (not YAML, just multiline text)
			if (
				typeof oldVal === "string" &&
				typeof newVal === "string" &&
				(oldVal.includes("\n") || newVal.includes("\n"))
			) {
				handleSimpleMultilineTextDiff(oldVal, newVal, fieldPath, output)
			} else {
				output.push(`    - ${formatSimpleValue(oldVal)}`)
				output.push(`    + ${formatSimpleValue(newVal)}`)
			}
			// Don't add trailing newline for script.sh
			if (fieldPath !== "data.script.sh") {
				output.push("")
			}
		}
	}
}

function handleArrayChanges(
	key: string,
	oldVal: any[],
	newVal: any[],
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	// Special handling for single named items in arrays (like containers)
	if (
		oldVal.length === 1 &&
		newVal.length === 1 &&
		typeof oldVal[0] === "object" &&
		typeof newVal[0] === "object" &&
		"name" in oldVal[0] &&
		"name" in newVal[0] &&
		oldVal[0].name === newVal[0].name
	) {
		// Same named item, compare as nested object
		const itemName = oldVal[0].name
		const nestedDiffs = compareObjects(
			oldVal[0],
			newVal[0],
			path ? `${path}.${key}.${itemName}` : `${key}.${itemName}`,
			resourceKey,
			includeResourceKey,
		)
		output.push(...nestedDiffs)
	} else {
		// Handle array changes
		const { removed, added, modified } = compareArrays(oldVal, newVal)

		// Handle additions and removals first (before modifications)
		if (removed.length > 0 || added.length > 0) {
			handleArrayAdditionsAndRemovals(key, oldVal, removed, added, path, resourceKey, includeResourceKey, output)
		}

		// Then handle modified items in arrays (like volumes with same name but different config)
		if (modified && modified.length > 0) {
			handleModifiedArrayItems(key, modified, path, resourceKey, includeResourceKey, output)
		}

		// Handle fallback case
		if (
			removed.length === 0 &&
			added.length === 0 &&
			(!modified || modified.length === 0) &&
			JSON.stringify(oldVal) !== JSON.stringify(newVal)
		) {
			// Arrays are different but no specific additions/removals detected
			const fieldPath = path ? `${path}.${key}` : key
			output.push(includeResourceKey && resourceKey ? `${fieldPath}  (${resourceKey})` : `${fieldPath}`)
			output.push(`  ± value change`)
			output.push(`    - ${formatSimpleValue(oldVal)}`)
			output.push(`    + ${formatSimpleValue(newVal)}`)
			output.push("")
		}
	}
}

function handleArrayAdditionsAndRemovals(
	key: string,
	oldVal: any[],
	removed: any[],
	added: any[],
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	const fieldPath = path ? `${path}.${key}` : key
	// Check if old array was empty - if so, don't show resourceKey
	const wasEmpty = Array.isArray(oldVal) && oldVal.length === 0
	if (wasEmpty && removed.length === 0) {
		output.push(fieldPath)
	} else {
		output.push(includeResourceKey && resourceKey ? `${fieldPath}  (${resourceKey})` : `${fieldPath}`)
	}

	if (removed.length > 0 && added.length > 0) {
		// Both additions and removals
		const removedStr = removed.length === 1 ? "one list entry removed:" : `${removed.length} list entries removed:`
		const addedStr =
			added.length === 1
				? "one list entry added:"
				: added.length === 2
					? "two list entries added:"
					: `${added.length} list entries added:`

		output.push(`  - ${removedStr}     + ${addedStr}`)

		// Format removed items
		for (const item of removed) {
			if (typeof item === "object") {
				formatArrayObject(item, output, "    - ", true)
			} else {
				output.push(`    - ${item}`)
			}
		}

		// Format added items aligned to the right
		if (added.length > 0) {
			const baseIndex = output.length - removed.length

			for (let i = 0; i < added.length; i++) {
				const item = added[i]
				const targetIndex = baseIndex + i

				if (targetIndex < output.length && output[targetIndex]) {
					const existingLine = output[targetIndex]
					// Align to column 34 (counting from 0)
					const padding = " ".repeat(Math.max(1, COLUMN_ALIGNMENT - existingLine.length))

					if (typeof item === "object") {
						output[targetIndex] = `${existingLine + padding}- ${formatObjectInline(item)}`
					} else {
						output[targetIndex] = `${existingLine + padding}- ${item}`
					}
				} else {
					const indent = " ".repeat(COLUMN_ALIGNMENT)
					if (typeof item === "object") {
						output.push(`${indent}- ${formatObjectInline(item)}`)
					} else {
						output.push(`${indent}- ${item}`)
					}
				}
			}
		}
	} else if (removed.length > 0) {
		const removedStr = removed.length === 1 ? "one list entry removed:" : `${removed.length} list entries removed:`
		output.push(`  - ${removedStr}`)
		for (const item of removed) {
			if (typeof item === "object") {
				formatArrayObject(item, output, "    - ", true)
			} else {
				output.push(`    - ${item}`)
			}
		}
	} else if (added.length > 0) {
		const addedStr = added.length === 1 ? "one list entry added:" : `${added.length} list entries added:`
		output.push(`  + ${addedStr}`)
		for (const item of added) {
			if (typeof item === "object") {
				formatArrayObject(item, output, "    - ", true)
			} else {
				output.push(`    - ${item}`)
			}
		}
	}

	output.push("")
}

function handleModifiedArrayItems(
	key: string,
	modified: any[],
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	for (const mod of modified) {
		const itemPath = path ? `${path}.${key}.${mod.name}` : `${key}.${mod.name}`

		// Check for special case where entire content is replaced
		const oldKeys = Object.keys(mod.old).filter((k) => k !== "name")
		const newKeys = Object.keys(mod.new).filter((k) => k !== "name")

		if (oldKeys.length === 1 && newKeys.length === 1 && oldKeys[0] !== newKeys[0]) {
			// This is a replacement like emptyDir -> persistentVolumeClaim
			output.push(includeResourceKey && resourceKey ? `${itemPath}  (${resourceKey})` : `${itemPath}`)
			output.push(`  - one map entry removed:     + one map entry added:`)

			const oldKey = oldKeys[0]!
			const newKey = newKeys[0]!
			const oldValue = mod.old[oldKey]
			const newValue = mod.new[newKey]

			if (typeof oldValue === "object" && Object.keys(oldValue).length === 0) {
				// Empty object like {}
				const removedStr = `    ${oldKey}: {}`
				const addedStr = `${newKey}:`
				const padding = " ".repeat(Math.max(1, 33 - removedStr.length))
				output.push(removedStr + padding + addedStr)

				// Add the details of the new value
				if (typeof newValue === "object") {
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
			const diffs = compareObjects(mod.old, mod.new, itemPath, resourceKey, includeResourceKey)
			output.push(...diffs)
		}
	}
}

function handleRemovedKeys(
	removedKeys: string[],
	oldObj: any,
	path: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	// Check if this removal can be shown side-by-side with an addition
	// This happens with volumes.data change from emptyDir to persistentVolumeClaim
	// We need to detect when a key's value changes from one type to another
	if (removedKeys.length === 1) {
		// Special case already handled in modified keys logic
	}

	for (const key of removedKeys) {
		const value = oldObj[key]
		output.push(includeResourceKey && resourceKey ? `${path}  (${resourceKey})` : `${path}`)
		if (typeof value === "object" && !Array.isArray(value)) {
			output.push(`  - one map entry removed:`)
			output.push(`    ${key}:`)
			formatNestedObject(value, output, "      ")
		} else {
			output.push(`  - one map entry removed:`)
			output.push(`    ${key}: ${formatSimpleValue(value)}`)
		}
		output.push("")
	}
}
