# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

kzdiff is a CLI tool for comparing Kustomize build results between branches. It's built with Bun, TypeScript, and uses native Git remote support with Kustomize's remote URL feature.

## Commands

### Development
```bash
# Run all tests
bun test

# Run specific test files
bun test cli.test.ts
bun test diff.test.ts
bun test kustomize.test.ts

# Run unit tests only (excluding CLI integration tests)
bun test:unit

# Format code with Biome
bun run format

# Lint and fix code with Biome
bun run lint

# Build standalone binary
bun run build

# Install globally for development
bun link
```

### Common Usage
```bash
# Show version
kzdiff --version

# Compare with auto-detected default branch (main/master)
kzdiff ./overlays/production

# Compare with specific branch or commit
kzdiff ./overlays/production -b develop
kzdiff ./overlays/production -r b44e5dcad7aa15e023eb09f24a5b9b968cc46e13

# Pass options to kustomize
kzdiff ./overlays/production -- --enable-helm

# Enable verbose debug output
kzdiff ./overlays/production -v
```

## Architecture

The codebase consists of focused modules:

- **cli.ts**: CLI entry point that handles argument parsing, Git operations, and orchestrates the diff process
- **kustomize.ts**: Handles Kustomize builds using remote URL syntax for Git references
- **diff.ts**: Wraps the system `diff` command with color support and fallback options
- **debug.ts**: Provides conditional debug logging controlled by verbose flag

Key implementation details:
- Uses Kustomize's native remote URL support (`https://github.com/owner/repo//path?ref=branch`)
- Temporary directory management for build outputs
- Auto-detects default branch when no ref is specified
- Handles non-existent remote directories gracefully (creates empty file)

## Tool Requirements

The project uses mise for tool version management:
- Bun 1.2.19+
- Kustomize 5.7.1
- Biome (installed via npm)

## Publishing

The package is published to npm as `kzdiff`. Version is managed in package.json and displayed via `--version` flag.