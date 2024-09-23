package lib_test

import (
	"testing"

	"github.com/shoppingjaws/kzdiff/src/lib"
	"github.com/stretchr/testify/assert"
)

var config = lib.Config{
	DyffPath:              "/path/to/dyff",
	DyffBetweenOptions:    []string{"--omit-header"},
	KustomizeBuildOptions: []string{"--enable-helm", "--load-restrictor", "LoadRestrictionsNone"},
	ComparedUri:           "main",
	KustomziePathPattern:  "overlays/**/kustomization.(yaml|yml)",
	HistorySize:           10,
	WorkspaceName:         "workspace",
	TmpDirPath:            "/tmp",
}

func TestKustomizeCommandBuilder(t *testing.T) {
	command := lib.KustomizeCommandBuilder(&config, lib.BuildTarget{Filename: "/path/to/kustomization.yaml", FullPath: "/path/to"})
	assert.Equal(t, "kustomize build --enable-helm --load-restrictor LoadRestrictionsNone /path/to", command.ToString())
}
