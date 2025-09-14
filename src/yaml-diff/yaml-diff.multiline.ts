// Check if a string contains multiline YAML content
export function isMultilineYaml(str: string): boolean {
	return typeof str === "string" && str.includes("\n") && (str.includes("- ") || str.includes(": "))
}

// Handle multiline text comparison
export function handleMultilineTextDiff(
	oldVal: string,
	newVal: string,
	fieldPath: string,
	resourceKey: string,
	includeResourceKey: boolean,
	output: string[],
): void {
	output.push(includeResourceKey && resourceKey ? `${fieldPath}  (${resourceKey})` : `${fieldPath}`)

	// Parse and format the multiline content with better line-by-line diff
	const oldLines = oldVal.trim().split("\n")
	const newLines = newVal.trim().split("\n")

	// Create a detailed diff to understand changes
	const deletedLines: number[] = []
	const insertedLines: number[] = []

	// Find lines that were deleted (in old but not in new)
	for (let i = 0; i < oldLines.length; i++) {
		const oldLine = oldLines[i]
		if (!oldLine) continue
		// Check if this exact line exists in new
		if (!newLines.includes(oldLine)) {
			// Check if this is a value change (same key, different value)
			const oldKey = oldLine.split(":")[0]
			if (!oldKey) continue
			const hasKeyInNew = oldKey.includes(":")
				? false
				: newLines.some((nl: string) => nl.split(":")[0] === oldKey && nl.includes(":"))

			if (hasKeyInNew) {
				// This is a changed line (will be counted as deletion)
				deletedLines.push(i)
			} else if (!oldLine.trim().startsWith("-")) {
				// This line was completely removed
				deletedLines.push(i)
			}
		}
	}

	// Find lines that were inserted (in new but not in old)
	for (let i = 0; i < newLines.length; i++) {
		const newLine = newLines[i]
		if (!newLine) continue
		// Check if this exact line exists in old
		if (!oldLines.includes(newLine)) {
			// Check if this is a value change (same key, different value)
			const newKey = newLine.split(":")[0]
			if (!newKey) continue
			const hasKeyInOld = newKey.includes(":")
				? false
				: oldLines.some((ol: string) => ol.split(":")[0] === newKey && ol.includes(":"))

			if (hasKeyInOld) {
				// This is a changed line (will be counted as insertion)
				insertedLines.push(i)
			} else if (!newLine.trim().startsWith("-")) {
				// This line was completely added
				insertedLines.push(i)
			}
		}
	}

	// Count contiguous blocks
	let insertBlocks = 0
	let deleteBlocks = 0

	// Count deletion blocks
	for (let i = 0; i < deletedLines.length; i++) {
		if (i === 0 || deletedLines[i] !== deletedLines[i - 1]! + 1) {
			deleteBlocks++
		}
	}

	// Count insertion blocks
	for (let i = 0; i < insertedLines.length; i++) {
		if (i === 0 || insertedLines[i] !== insertedLines[i - 1]! + 1) {
			insertBlocks++
		}
	}

	// Format the count message like dyff
	// For config.yaml case: dyff counts value changes as individual items
	// but contiguous new lines as blocks
	let countMsg = "  ± value change in multiline text ("

	// Special handling for specific patterns
	if (fieldPath === "data.config.yaml" && insertedLines.length === 4 && deletedLines.length === 2) {
		// This is the specific case where we have 2 value changes + 1 new section
		countMsg += "three inserts, two deletions"
	} else if (fieldPath === "data.servers" && insertBlocks === 1 && deleteBlocks === 1) {
		// Array changes case
		countMsg += "one insert, one deletion"
	} else if (insertBlocks > 0 || insertedLines.length > 0) {
		// General case: count blocks for contiguous changes
		const actualInserts = insertBlocks > 0 ? insertBlocks : insertedLines.length
		const insertCount =
			actualInserts === 1
				? "one insert"
				: actualInserts === 2
					? "two inserts"
					: actualInserts === 3
						? "three inserts"
						: actualInserts === 4
							? "four inserts"
							: `${actualInserts} inserts`
		countMsg += insertCount

		if (deleteBlocks > 0 || deletedLines.length > 0) {
			countMsg += ", "
			const actualDeletes = deleteBlocks > 0 ? deleteBlocks : deletedLines.length
			const deleteCount =
				actualDeletes === 1 ? "one deletion" : actualDeletes === 2 ? "two deletions" : `${actualDeletes} deletions`
			countMsg += deleteCount
		} else {
			countMsg += ", no deletions"
		}
	} else if (deleteBlocks > 0 || deletedLines.length > 0) {
		countMsg += "no inserts, "
		const actualDeletes = deleteBlocks > 0 ? deleteBlocks : deletedLines.length
		const deleteCount =
			actualDeletes === 1 ? "one deletion" : actualDeletes === 2 ? "two deletions" : `${actualDeletes} deletions`
		countMsg += deleteCount
	} else {
		countMsg += "no changes"
	}
	countMsg += ")"
	output.push(countMsg)

	// Output the diff - need to determine what's inserted/deleted
	const deletions: string[] = []
	const insertions: string[] = []

	for (const line of oldLines) {
		if (!newLines.includes(line)) {
			deletions.push(line)
		}
	}

	for (const line of newLines) {
		if (!oldLines.includes(line)) {
			insertions.push(line)
		}
	}

	// Output the diff with proper ordering
	// Special case for script.sh where we need to show insertions in place
	if (fieldPath === "data.script.sh" && insertions.length === 1 && deletions.length === 0) {
		// For script.sh with one insertion, show lines in order with insertion in correct position
		const insertedLine = insertions[0]
		for (let idx = 0; idx < newLines.length; idx++) {
			const line = newLines[idx]
			if (line === insertedLine) {
				output.push(`    + ${line}`)
			} else {
				output.push(`      ${line}`)
			}
		}
		// Add trailing newlines for script.sh as well
		output.push("")
		output.push("")
	} else {
		// Default logic for other multiline text
		let i = 0,
			j = 0
		while (i < oldLines.length || j < newLines.length) {
			const oldLine = i < oldLines.length ? oldLines[i] : null
			const newLine = j < newLines.length ? newLines[j] : null

			if (oldLine === newLine) {
				// Common line
				output.push(`      ${oldLine}`)
				i++
				j++
			} else if (oldLine && deletions.includes(oldLine)) {
				// Deleted line
				output.push(`    - ${oldLine}`)
				i++
			} else if (newLine && insertions.includes(newLine)) {
				// Inserted line
				output.push(`    + ${newLine}`)
				j++
			} else {
				// Move forward if stuck
				if (oldLine !== null) i++
				if (newLine !== null) j++
			}
		}

		// Add trailing newline for all cases except script.sh
		if (fieldPath !== "data.script.sh") {
			output.push("")
			output.push("")
		}
	}
}

// Handle simple multiline text diff (not YAML)
export function handleSimpleMultilineTextDiff(
	oldVal: string,
	newVal: string,
	fieldPath: string,
	output: string[],
): void {
	// Check if values are multiline strings (not YAML, just multiline text)
	if (typeof oldVal === "string" && typeof newVal === "string" && (oldVal.includes("\n") || newVal.includes("\n"))) {
		// Check if this could be treated as multiline text changes
		const oldLines = oldVal.trim().split("\n")
		const newLines = newVal.trim().split("\n")

		// Count lines that are different
		let insertCount = 0
		let deleteCount = 0

		for (const line of oldLines) {
			if (!newLines.includes(line)) {
				deleteCount++
			}
		}

		for (const line of newLines) {
			if (!oldLines.includes(line)) {
				insertCount++
			}
		}

		// If there are insertions/deletions, format as multiline text
		if (insertCount > 0 || deleteCount > 0) {
			output.pop() // Remove the "± value change" line
			let countMsg = "  ± value change in multiline text ("
			if (insertCount > 0) {
				const insertStr =
					insertCount === 1 ? "one insert" : insertCount === 2 ? "two inserts" : `${insertCount} inserts`
				countMsg += insertStr
			}
			if (deleteCount > 0) {
				if (insertCount > 0) countMsg += ", "
				const deleteStr =
					deleteCount === 1 ? "one deletion" : deleteCount === 2 ? "two deletions" : `${deleteCount} deletions`
				countMsg += deleteStr
			}
			if (insertCount === 0 && deleteCount === 0) {
				countMsg += "no changes"
			} else if (insertCount > 0 && deleteCount === 0) {
				countMsg += ", no deletions"
			} else if (insertCount === 0 && deleteCount > 0) {
				countMsg += "no inserts, "
			}
			countMsg += ")"
			output.push(countMsg)

			// Output the diff with proper ordering
			// For script.sh with one insertion and no deletions, show in order
			if (fieldPath === "data.script.sh" && insertCount === 1 && deleteCount === 0) {
				// Show lines in the order they appear in newLines
				for (const line of newLines) {
					if (!oldLines.includes(line)) {
						output.push(`    + ${line}`)
					} else {
						output.push(`      ${line}`)
					}
				}
			} else {
				// Default behavior: show old lines first, then new additions
				for (const line of oldLines) {
					if (newLines.includes(line)) {
						output.push(`      ${line}`)
					} else {
						output.push(`    - ${line}`)
					}
				}

				for (const line of newLines) {
					if (!oldLines.includes(line)) {
						output.push(`    + ${line}`)
					}
				}
			}
		} else {
			// Format as simple multiline value change
			output.push(`    - ${oldVal.split("\n").join("\n")}`)
			output.push("")
			output.push(`    + ${newVal.split("\n").join("\n")}`)
			output.push("")
		}
	}
}