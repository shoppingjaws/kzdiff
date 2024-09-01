package lib_test

import (
	"testing"

	"github.com/shoppingjaws/kzdiff/src/lib"
	"github.com/stretchr/testify/assert"
)

var config = lib.Config{
	DyffPath:              "/path/to/dyff",
	KustomizeBuildOptions: []string{"--enable-helm", "--load-restrictor", "LoadRestrictionsNone"},
	ComparedBranch:        "main",
	KustomziePathPattern:  "overlays/**/kustomization.(yaml|yml)",
	HistorySize:           10,
	RepositoryName:        "workspace",
	TmpDirPath:            "/tmp",
}

func TestKustomizeCommandBuilder(t *testing.T) {
	command := lib.KustomizeCommandBuilder(config, lib.BuildTarget{Filename: "/path/to/kustomization.yaml"})
	assert.Equal(t, "kustomize build --enable-helm --load-restrictor LoadRestrictionsNone /path/to", command.ToString())
}
