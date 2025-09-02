# yaml-diff Module

This module provides YAML diffing functionality that mimics the output format of the `dyff` tool for Kubernetes resources.

## Overview

The yaml-diff module compares two YAML documents (typically Kubernetes manifests) and produces a human-readable diff output that matches dyff's format exactly. It handles:
- Document-level changes (additions/removals)
- Field-level changes (modifications)
- Multiline text comparisons
- Array and nested object comparisons
- Kubernetes resource key generation

## Architecture

### Core Components

- **index.ts**: Main entry point containing the `yamlDiff` function
- **yaml-diff.types.ts**: TypeScript type definitions for the module
- **yaml-diff.parsers.ts**: YAML parsing and resource key generation
- **yaml-diff.compare-objects.ts**: Object comparison logic with path tracking
- **yaml-diff.comparators.ts**: Type-specific comparison functions
- **yaml-diff.formatters.ts**: Output formatting utilities
- **yaml-diff.multiline.ts**: Multiline text diff handling
- **yaml-diff.ordering.ts**: Field ordering for Kubernetes resources
- **yaml-diff.constants.ts**: Shared constants and configuration

### Key Features

1. **Resource Identification**: Uses apiVersion, kind, and metadata.name to uniquely identify Kubernetes resources
2. **Field Ordering**: Maintains dyff-compatible field ordering for Kubernetes resources
3. **Multiline Support**: Special handling for ConfigMap data and other multiline fields
4. **Array Comparison**: Intelligent array diffing with index tracking
5. **Output Formatting**: Exact replication of dyff's output format including indentation and symbols

## Testing

The module uses integration tests that compare output against expected dyff results:

```bash
# Run all yaml-diff tests
bun test src/yaml-diff/index.test.ts
```

Test cases are stored in `integration-test/case_*` directories, each containing:
- `before.yaml`: Original YAML document
- `after.yaml`: Modified YAML document
- `expected.txt`: Expected dyff output

## Usage Example

```typescript
import { yamlDiff } from "./yaml-diff"

const oldYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  key1: value1
`

const newYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  key1: value2
  key2: new-value
`

const diff = yamlDiff(oldYaml, newYaml, {
  ignoreOrderChanges: true,
  omitHeader: true
})
```

## Implementation Notes

- The module recreates dyff's exact output format including whitespace, indentation, and special characters
- Resource keys are formatted as `<kind>/<name>` (e.g., `ConfigMap/app-config`)
- Document additions/removals are handled separately from field-level changes
- Special formatting rules apply to certain fields (e.g., image fields get quoted)
- Trailing newlines follow specific patterns based on content type