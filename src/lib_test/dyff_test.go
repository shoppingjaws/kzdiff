package lib_test

import (
	"testing"

	"github.com/shoppingjaws/kzdiff/src/lib"
	"github.com/stretchr/testify/assert"
)

func TestDyffBetweenCommandBuilder(t *testing.T) {
	command := lib.DyffBetweenCommandBuilder(config, "fromPath", "toPath")
	assert.Equal(t, "/path/to/dyff between --omit-header fromPath toPath", command.ToString())
}
