# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

kzdiff is a CLI tool for comparing Kustomize build results between branches. It's built with Bun, TypeScript, and follows functional programming patterns with comprehensive error handling.

## Commands

### Development
```bash
# Run tests
bun test

# Run CLI locally
bun run kzdiff
# Or directly
bun run ./src/kzdiff-cli.ts

# Build for Bun runtime
bun run build

# Create standalone binary
bun run build:standalone

# Install globally for development
bun link
```

### Common Usage
```bash
# Compare current directory with main branch
kzdiff

# Compare specific directory
kzdiff ./overlays/production

# Compare with different base branch
kzdiff -b develop

# Compare remote repository
kzdiff -r https://github.com/kubernetes-sigs/kustomize.git /examples/springboot/base
```

## Architecture

The codebase follows a modular architecture:

- **kzdiff-cli.ts**: CLI entry point with argument parsing
- **kzdiff.ts**: Core logic for Git operations and Kustomize builds
- **utils.ts**: Utility functions for Git, Kustomize, and file operations
- **diff.ts**: YAML diffing and formatting with colored output
- **index.ts**: Public API exports

Key patterns:
- Async/await throughout
- Error-first design with detailed error messages
- Temporary directory management for Git operations
- Fixture-based testing in tests/fixtures/

## Development Guidelines

1. **Always use Bun** - All commands should use `bun`, not `npm`
2. **TypeScript strict mode** - The project uses strict TypeScript configuration
3. **Test-driven development** - Write tests using Bun's built-in test runner
4. **Error handling** - Follow the established pattern of throwing descriptive errors
5. **Git state management** - Be careful with stashing/restoring when working with Git operations

## Testing

Tests use fixture-based approach with pre-built Kustomize results:
- Test fixtures are in `tests/fixtures/`
- Each test case has `from/result/build.yaml` and `to/result/build.yaml`
- Run single test: `bun test -t "test name"`

## Dependencies

- **Runtime**: Bun, Git, Kustomize (managed via mise)
- **Libraries**: chalk (colors), diff (text diffing)
- **Development**: TypeScript, @types/bun, @types/diff