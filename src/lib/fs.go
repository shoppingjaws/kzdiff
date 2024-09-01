package lib

import (
	"strconv"
	"strings"
	"time"
)

func DeleteOversizedHistory(c Config) {
}

func GetTiemstamp() string {
	timesamp := time.Now().Unix()
	return strconv.FormatInt(timesamp, 10)
}
func GetNextHistoryDir(c Config, branch string) string {
	return (c.GetOutputDir() + "/" + GetTiemstamp())
}

func ToFilename(path string) string {
	return strings.ReplaceAll(path, "/", "_")
}
