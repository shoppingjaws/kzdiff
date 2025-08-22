import { JSONPath } from "jsonpath-plus";
import * as yaml from "js-yaml";
import { createDebugLogger } from "./debug";

interface K8sResource {
	kind?: string;
	metadata?: {
		name?: string;
		namespace?: string;
		labels?: Record<string, string>;
	};
	spec?: {
		replicas?: number;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

const debug = createDebugLogger("filter");

export async function filterYaml(
	filePath: string,
	filters: string[],
): Promise<void> {
	if (filters.length === 0) {
		return;
	}

	debug(`Filtering ${filePath} with ${filters.length} filter(s)`);

	try {
		// Read YAML file
		const fileContent = await Bun.file(filePath).text();
		if (!fileContent.trim()) {
			debug("File is empty, skipping filter");
			return;
		}

		// Parse YAML documents (handle multi-document YAML)
		const documents = yaml.loadAll(fileContent);
		debug(`Loaded ${documents.length} document(s) from YAML`);

		// Convert filters to JSONPath expressions
		const jsonPathFilters = filters.map(convertToJsonPath);
		debug(`Converted filters to JSONPath: ${jsonPathFilters.join(", ")}`);

		// Filter documents
		const filteredDocuments: K8sResource[] = [];
		for (const doc of documents) {
			const resource = doc as K8sResource;
			if (matchesAnyFilter(resource, jsonPathFilters)) {
				filteredDocuments.push(resource);
			}
		}

		debug(
			`Filtered ${documents.length} document(s) to ${filteredDocuments.length}`,
		);

		// Write filtered YAML back to file
		let outputContent = "";
		if (filteredDocuments.length > 0) {
			outputContent = filteredDocuments
				.map((doc) => yaml.dump(doc, { noRefs: true }))
				.join("---\n");
		}

		await Bun.write(filePath, outputContent);
		debug(`Wrote filtered content back to ${filePath}`);
	} catch (error) {
		console.error(`Error filtering YAML file ${filePath}:`, error);
		throw error;
	}
}

function convertToJsonPath(filter: string): string {
	// Check if it's already a JSONPath expression
	if (filter.startsWith("$") || filter.startsWith("[")) {
		return filter;
	}

	// Parse simple filter expressions
	const equalMatch = filter.match(/^(\w+)=(.+)$/);
	if (equalMatch?.[2]) {
		const [, key, value] = equalMatch;
		const quotedValue = value?.startsWith('"') ? value : `'${value}'`;

		// Convert common shortcuts to JSONPath
		switch (key) {
			case "kind":
				return `$[?(@.kind==${quotedValue})]`;
			case "name":
				return `$[?(@.metadata.name==${quotedValue})]`;
			case "namespace":
				return `$[?(@.metadata.namespace==${quotedValue})]`;
			default:
				// For other keys, assume it's a top-level property
				return `$[?(@.${key}==${quotedValue})]`;
		}
	}

	// If we can't parse it, assume it's a JSONPath expression
	debug(`Warning: Could not parse filter "${filter}", using as-is`);
	return filter;
}

function matchesAnyFilter(doc: K8sResource, jsonPathFilters: string[]): boolean {
	if (!doc || typeof doc !== "object") {
		return false;
	}

	for (const filter of jsonPathFilters) {
		try {
			// Wrap document in array for consistent JSONPath evaluation
			const wrapper = [doc];
			const results = JSONPath({
				path: filter,
				json: wrapper,
			});

			// If the filter returns any results, consider it a match
			if (results && results.length > 0) {
				// Check if the result contains the document or any truthy value
				if (results.includes(doc) || results.length > 0) {
					debug(`Document matched filter: ${filter}`);
					return true;
				}
			}
		} catch (error) {
			debug(`Error applying filter "${filter}": ${error}`);
			// Continue with other filters
		}
	}

	return false;
}
