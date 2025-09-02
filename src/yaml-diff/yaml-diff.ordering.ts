// Order metadata fields according to dyff's convention
export function orderMetadata(metadata: any): any {
	if (!metadata) return metadata

	const ordered: any = {}
	if ("name" in metadata) ordered.name = metadata.name
	if ("namespace" in metadata) ordered.namespace = metadata.namespace
	if ("labels" in metadata) {
		// Order labels: version first, then app, then others
		const labels = metadata.labels
		const orderedLabels: any = {}
		if ("version" in labels) orderedLabels.version = labels.version
		if ("app" in labels) orderedLabels.app = labels.app
		if ("environment" in labels) orderedLabels.environment = labels.environment
		// Add remaining labels
		for (const [key, value] of Object.entries(labels)) {
			if (!["version", "app", "environment"].includes(key)) {
				orderedLabels[key] = value
			}
		}
		ordered.labels = orderedLabels
	}
	if ("annotations" in metadata) ordered.annotations = metadata.annotations

	// Add remaining fields
	for (const [key, value] of Object.entries(metadata)) {
		if (!["name", "namespace", "labels", "annotations"].includes(key)) {
			ordered[key] = value
		}
	}

	return ordered
}

// Order spec fields recursively
export function orderSpec(spec: any): any {
	if (!spec) return spec
	if (typeof spec !== "object" || Array.isArray(spec)) return spec

	const ordered: any = {}

	// Process each field, recursively ordering nested objects
	for (const [key, value] of Object.entries(spec)) {
		if (key === "template" && value && typeof value === "object") {
			// Order template specially
			const template: any = value as any
			const orderedTemplate: any = {}
			if ("metadata" in template) {
				orderedTemplate.metadata = orderMetadata(template.metadata)
			}
			if ("spec" in template) {
				orderedTemplate.spec = orderSpec(template.spec)
			}
			// Add remaining template fields
			for (const [k, v] of Object.entries(template)) {
				if (!["metadata", "spec"].includes(k)) {
					orderedTemplate[k] = v
				}
			}
			ordered.template = orderedTemplate
		} else if (key === "containers" && Array.isArray(value)) {
			// Process containers array
			ordered.containers = value.map((container: any) => {
				const orderedContainer: any = {}
				// Order container fields
				if ("name" in container) orderedContainer.name = container.name
				if ("image" in container) orderedContainer.image = container.image
				if ("ports" in container) orderedContainer.ports = container.ports
				if ("env" in container) orderedContainer.env = container.env
				if ("resources" in container) orderedContainer.resources = container.resources
				if ("volumeMounts" in container) orderedContainer.volumeMounts = container.volumeMounts
				if ("livenessProbe" in container) orderedContainer.livenessProbe = container.livenessProbe
				// Add remaining fields
				for (const [k, v] of Object.entries(container)) {
					if (!["name", "image", "ports", "env", "resources", "volumeMounts", "livenessProbe"].includes(k)) {
						orderedContainer[k] = v
					}
				}
				return orderedContainer
			})
		} else {
			ordered[key] = value
		}
	}

	return ordered
}