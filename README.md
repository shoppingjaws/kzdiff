# kzdiff

A CLI tool for comparing Kustomize build results between branches.

## Installation

```bash
npm install -g kzdiff
```

## Prerequisites

- Git
- Kustomize

## Usage

### Basic usage (compare with main branch)

```bash
kzdiff ./overlays/production
```

### Compare with specific branch

```bash
kzdiff ./overlays/production -b develop
```

### Compare with a local branch (not pushed yet)

```bash
kzdiff ./overlays/production -b feature/my-working-branch
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

- `-b, --branch <ref>` - Branch, commit, or ref to compare against (remote by default)
- `-r, --ref <ref>` - Same as -b/--branch
- `-f, --filter <expr>` - Filter resources (can be specified multiple times)
- `-v, --verbose` - Enable verbose debug logging
- `-h, --help` - Display help
- `--version` - Show version number
- `--` - Pass remaining arguments to kustomize

## Examples

```bash
# Compare with auto-detected default branch (main/master)
kzdiff ./overlays/production

# Compare with specific branch
kzdiff ./overlays/production -b develop

# Compare with a local branch that hasn't been pushed yet
kzdiff ./overlays/production -b feature/my-working-branch

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

# Force comparison against the remote branch even if a local branch exists
kzdiff ./overlays/production -b origin/staging
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