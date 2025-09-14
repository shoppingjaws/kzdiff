import type { ArrayComparisonResult } from "./yaml-diff.types"

// Compare arrays and detect specific changes
export function compareArrays(oldArr: any[], newArr: any[]): ArrayComparisonResult {
	// For simple arrays (strings, numbers)
	if (oldArr.length > 0 && typeof oldArr[0] !== "object") {
		const oldSet = new Set(oldArr)
		const newSet = new Set(newArr)

		const removed = oldArr.filter((item) => !newSet.has(item))
		const added = newArr.filter((item) => !oldSet.has(item))

		return { removed, added }
	}

	// For arrays of objects (like containers, volumes)
	// Try to match by 'name' field if available
	const oldByName = new Map()
	const newByName = new Map()

	for (const item of oldArr) {
		if (item && typeof item === "object" && "name" in item) {
			oldByName.set(item.name, item)
		}
	}

	for (const item of newArr) {
		if (item && typeof item === "object" && "name" in item) {
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
		if (!newArr.some((newItem) => JSON.stringify(item) === JSON.stringify(newItem))) {
			removed.push(item)
		}
	}

	// Items only in new array
	for (const item of newArr) {
		if (!oldArr.some((oldItem) => JSON.stringify(item) === JSON.stringify(oldItem))) {
			added.push(item)
		}
	}

	return { removed, added }
}
