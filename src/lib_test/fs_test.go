package lib_test

import (
	"os"
	"testing"

	"github.com/shoppingjaws/kzdiff/src/lib"
	"github.com/stretchr/testify/assert"
)

func TestFindChangedEntries(t *testing.T) {
	from, _ := os.ReadDir("fs_test/from")
	to, _ := os.ReadDir("fs_test/to")
	assert.Equal(t, 3, len(from))
	assert.Equal(t, 3, len(to))
	updated, deleted, created := lib.FindChangedEntries(from, to)
	assert.Equal(t, 2, len(updated))
	assert.Equal(t, 1, len(deleted))
	assert.Equal(t, "deleted1", deleted[0].Name())
	assert.Equal(t, 1, len(created))
}
