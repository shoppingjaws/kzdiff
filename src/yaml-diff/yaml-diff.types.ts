export interface YamlDiffOptions {
	useGoPatchStyle?: boolean
	ignoreOrderChanges?: boolean
	ignoreWhitespaceChanges?: boolean
	detectRenames?: boolean
	omitHeader?: boolean
	useColor?: boolean
	contextLines?: number
}

export interface K8sResource {
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

export interface ArrayComparisonResult {
	removed: any[]
	added: any[]
	modified?: any[]
}

export interface PathDiff {
	path: string
	lines: string[]
	resourceKey: string
}
