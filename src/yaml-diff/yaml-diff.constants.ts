// YAML dump options for consistent formatting
export const YAML_DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	noArrayIndent: true,
	quotingType: '"' as const,
	forceQuotes: false,
}

// Column alignment for side-by-side diffs
export const COLUMN_ALIGNMENT = 34

// Field ordering priorities
export const METADATA_FIELD_ORDER = ["name", "namespace", "labels", "annotations"]
export const LABEL_FIELD_ORDER = ["version", "app", "environment"]
export const CONTAINER_FIELD_ORDER = ["name", "image", "ports", "env", "resources", "volumeMounts", "livenessProbe"]
export const DOCUMENT_FIELD_ORDER = ["type", "apiVersion", "kind", "metadata", "spec"]

// Regular expressions
export const SIMPLE_STRING_REGEX = /^[a-zA-Z0-9._\-/]+$/
