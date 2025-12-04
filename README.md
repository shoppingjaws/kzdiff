# kzdiff

A CLI tool for comparing Kustomize build results between branches or local directories.

## Installation

```bash
npm install -g kzdiff
```

## Prerequisites

- Git
- Kustomize

## Usage

### Compare with remote branch (default: main)

```bash
kzdiff ./overlays/production
```

### Compare with specific branch

```bash
kzdiff ./overlays/production -b develop
```

### Compare local directories

```bash
# Compare staging and production environments
kzdiff ./overlays/staging ./overlays/production

# Compare any two Kustomize directories
kzdiff ./base ./overlays/dev
```

### Filter specific resources

```bash
# Show only Deployments
kzdiff ./overlays/production -f kind=Deployment

# Show multiple resource types
kzdiff ./overlays/production -f kind=Deployment -f kind=Service

# Filter by name
kzdiff ./overlays/production -f name=my-app

# Filter by namespace
kzdiff ./overlays/production -f namespace=production
```

### Advanced filtering with JSONPath

```bash
# Filter by replica count
kzdiff ./overlays/production -f '$[?(@.spec.replicas>2)]'

# Filter by labels
kzdiff ./overlays/production -f '$[?(@.metadata.labels.team=="platform")]'
```

## Options

- `-b, --branch <ref>` - Remote branch or commit to compare against (remote comparison only, default: auto-detect)
- `-r, --ref <ref>` - Same as -b/--branch
- `-f, --filter <expr>` - Filter resources using JSONPath expressions (can be specified multiple times)
- `-v, --verbose` - Enable verbose debug logging
- `-h, --help` - Display help
- `--version` - Show version number
- `--` - Pass remaining arguments to kustomize

## Examples

### Remote branch comparison

```bash
# Compare with auto-detected default branch (main/master)
kzdiff ./overlays/production

# Compare with specific branch
kzdiff ./overlays/production -b develop

# Compare with specific commit
kzdiff ./overlays/production -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13

# Filter to show only Deployments and Services
kzdiff ./overlays/production -f kind=Deployment -f kind=Service

# Complex filtering with JSONPath
kzdiff ./overlays/production -f '$[?(@.spec.replicas>2)]' -b main

# Pass options to kustomize
kzdiff ./overlays/production -- --enable-helm

# Combine multiple options
kzdiff ./overlays/production -b staging -f kind=Deployment -- --enable-helm
```

### Local directory comparison

```bash
# Compare two local environments
kzdiff ./overlays/staging ./overlays/production

# Compare with filters
kzdiff ./overlays/staging ./overlays/production -f kind=Deployment

# Compare with kustomize options
kzdiff ./overlays/staging ./overlays/production -- --enable-helm

# Combine filters and kustomize options
kzdiff ./overlays/dev ./overlays/prod -f kind=Service -f kind=Deployment -- --load-restrictor=none
```

## Development

### Prerequisites

- Bun 1.2.19+
- mise (for tool version management)

### Setup

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build standalone binary
bun run build:standalone

# Install locally for development
bun link
```

### Project Structure

```
kzdiff/
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── kustomize.ts    # Core Kustomize operations
│   ├── diff.ts         # YAML diffing logic
│   ├── filter.ts       # Resource filtering with JSONPath
│   └── debug.ts        # Debug utilities
├── examples/           # Example Kustomize configurations
└── tests/             # Test files
```

## License

MIT