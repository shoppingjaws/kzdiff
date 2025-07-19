#!/bin/bash

# Run tests after editing code files
if [[ "$CLAUDE_HOOK_TOOL_NAME" == "Edit" || "$CLAUDE_HOOK_TOOL_NAME" == "MultiEdit" || "$CLAUDE_HOOK_TOOL_NAME" == "Write" ]]; then
  # Check if the edited file is a TypeScript file
  if [[ "$CLAUDE_HOOK_ARG_file_path" =~ \.(ts|tsx)$ ]]; then
    echo "Running tests after code edit..."
    bun test
  fi
fi