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
kzdiff -b develop ./overlays/production
```

### Compare remote repository

```bash
kzdiff -r https://github.com/kubernetes-sigs/kustomize.git /examples/springboot/base
```

## Options

- `-b, --base-branch <branch>` - Base branch to compare against (default: main)
- `-r, --repository <url>` - Remote repository URL
- `-h, --help` - Display help

## Examples

```bash
# Compare current directory with main branch
kzdiff

# Compare specific overlay
kzdiff ./overlays/production

# Compare with develop branch
kzdiff -b develop ./overlays/staging

# Compare remote repository
kzdiff -r https://github.com/your-org/your-repo.git /path/to/kustomization
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
│   └── debug.ts        # Debug utilities
├── examples/           # Example Kustomize configurations
└── tests/             # Test files
```

## License

MIT