# What's this?

This tool allows you to easily and collectively check the differences between remote and local builds in a Kustomize build environment.

dyff already provides an easy way to check the output differences of Kustomize, but scripting was required to check the differences between branches or multiple output differences.

kzdiff simplifies diff management in Kustomize in development and CI environments.

## Dependencies

- [dyff](https://github.com/homeport/dyff)
- [kustomize](https://github.com/kubernetes-sigs/kustomize)

## First step

### build locally

Build current kustomize output and write it to tmp dir

```bash
kzdiff build
```

### build remotely

```bash
kzdiff build -remote -remote_uri=github.com/shoppingjaws/kzdiff
```

### compare via dyff

Compare with dyff and write it to `tmp_dir_path/output`

```bash
kzdiff compare
```
