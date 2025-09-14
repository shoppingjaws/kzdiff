// Format a simple value for output
export function formatSimpleValue(value: any): string {
	if (typeof value === "string") {
		// Don't quote simple strings that don't need it
		// This includes boolean strings and numbers
		if (/^[a-zA-Z0-9._\-/]+$/.test(value)) {
			return value
		}
		return value
	}
	if (value === null) return "null"
	if (value === undefined) return "undefined"
	if (typeof value === "boolean") {
		return String(value)
	}
	if (typeof value === "number") {
		return String(value)
	}
	if (Array.isArray(value)) {
		return JSON.stringify(value)
	}
	return String(value)
}

// Format nested object for output
export function formatNestedObject(obj: any, output: string[], indent: string): void {
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			output.push(`${indent}${key}:`)
			formatNestedObject(value, output, `${indent}  `)
		} else {
			// Special handling for 'value' field in env vars
			if (key === "value" && typeof value === "string" && (value === "true" || value === "false")) {
				output.push(`${indent}${key}: "${value}"`)
			} else {
				output.push(`${indent}${key}: ${formatSimpleValue(value)}`)
			}
		}
	}
}

// Format an object in an array for output
export function formatArrayObject(obj: any, output: string[], prefix: string, _inline: boolean): void {
	if (typeof obj !== "object" || obj === null) {
		output.push(`${prefix}${obj}`)
		return
	}

	const entries = Object.entries(obj)
	if (entries.length === 0) {
		output.push(`${prefix}{}`)
		return
	}

	// First entry gets the prefix
	const [firstKey, firstValue] = entries[0]!
	if (typeof firstValue === "object" && !Array.isArray(firstValue)) {
		output.push(`${prefix}${firstKey}:`)
		formatNestedObject(firstValue, output, `${prefix.replace("-", " ")}  `)
	} else {
		output.push(`${prefix}${firstKey}: ${formatSimpleValue(firstValue)}`)
	}

	// Remaining entries
	for (let i = 1; i < entries.length; i++) {
		const [key, value] = entries[i]!
		const indent = prefix.replace("-", " ")
		if (typeof value === "object" && !Array.isArray(value)) {
			output.push(`${indent}${key}:`)
			formatNestedObject(value, output, `${indent}  `)
		} else {
			// Special handling for 'value' field in env vars
			if (key === "value" && typeof value === "string" && (value === "true" || value === "false")) {
				output.push(`${indent}${key}: "${value}"`)
			} else {
				output.push(`${indent}${key}: ${formatSimpleValue(value)}`)
			}
		}
	}
}

// Format object inline for compact display
export function formatObjectInline(obj: any): string {
	if (typeof obj !== "object" || obj === null) return String(obj)

	const parts = []
	for (const [key, value] of Object.entries(obj)) {
		// Skip undefined values
		if (value === undefined) continue

		if (typeof value === "object") {
			parts.push(`${key}: ${JSON.stringify(value)}`)
		} else {
			parts.push(`${key}: ${value}`)
		}
	}
	return parts.join(", ")
}
