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

func GetRemoteDir(c Config) string {
	return c.TmpDirPath + c.RepositoryName + "/remote/" + c.ComparedBranch
}

func GetCurrentLatestDir(c Config) string {
	entries, _ := os.ReadDir(c.TmpDirPath + c.RepositoryName + "/current/")
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() > entries[j].Name()
	})
	return c.TmpDirPath + c.RepositoryName + "/current/" + entries[0].Name()
}

func GetOutputDir(c Config) string {
	dir := c.TmpDirPath + c.RepositoryName + "/output/"
	return dir
}

func ClearOutputDir(c Config) {
	os.RemoveAll(GetOutputDir(c))
}

func ListBuildResults(c Config, fromPath string, toPath string) (updated []os.DirEntry, deleted []os.DirEntry, created []os.DirEntry) {
	fromEntries, _ := os.ReadDir(fromPath)
	toEntries, _ := os.ReadDir(toPath)
	return FindChangedEntries(fromEntries, toEntries)
}

func GetTiemstamp() string {
	timesamp := time.Now().Unix()
	return strconv.FormatInt(timesamp, 10)
}

func ToFilename(path string) string {
	return strings.ReplaceAll(path, "/", "_")
}

func FindChangedEntries(fromEntries []os.DirEntry, toEntries []os.DirEntry) (updated []os.DirEntry, deleted []os.DirEntry, created []os.DirEntry) {
	updated = []os.DirEntry{}
	deleted = []os.DirEntry{}
	created = []os.DirEntry{}
	for _, fromEntry := range fromEntries {
		idx, toEntry := findEntries(toEntries, fromEntry.Name())
		if idx != -1 && !toEntry.IsDir() && !fromEntry.IsDir() {
			updated = append(updated, fromEntry)
		} else if idx == -1 && !fromEntry.IsDir() {
			deleted = append(deleted, fromEntry)
		}
	}
	for _, toEntry := range toEntries {
		idx, _ := findEntries(fromEntries, toEntry.Name())
		if idx == -1 && !toEntry.IsDir() {
			created = append(created, toEntry)
		}
	}
	return
}

func findEntries(slice []os.DirEntry, val string) (int, os.DirEntry) {
	for i, item := range slice {
		if item.Name() == val && !item.IsDir() {
			return i, item
		}
	}
	return -1, nil
}
