# kzdiff

This is the tool that make you to easy compare the kustomize revision change.

## Required
- dyff
- kustomize

## First step

1. build

`kzdiff build // Build current kustomize output and write it to tmp dir`

2. build remotely
`kzdiff build -remote // Referencing a remote branch and build and write it to tmp dir`

3. compare via dyff
`kzdiff compare // Compare them`