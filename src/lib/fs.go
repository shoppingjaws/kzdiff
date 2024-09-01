package lib

import (
	"log/slog"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

func DeleteOversizedHistory(c Config) {
	entry, _ := os.ReadDir(c.TmpDirPath + c.RepositoryName + "/current/")
	if len(entry) > c.HistorySize {
		slog.Debug("HistorySize is over")
	}
}

func GetCurrentLatestDir(c Config) string {
	entry, _ := os.ReadDir(c.TmpDirPath + c.RepositoryName + "/current/")
	sort.Slice(entry, func(i, j int) bool {
		return entry[i].Name() > entry[j].Name()
	})
	return c.TmpDirPath + c.RepositoryName + "/current/" + entry[0].Name()
}

func GetTiemstamp() string {
	timesamp := time.Now().Unix()
	return strconv.FormatInt(timesamp, 10)
}

func ToFilename(path string) string {
	return strings.ReplaceAll(path, "/", "_")
}
