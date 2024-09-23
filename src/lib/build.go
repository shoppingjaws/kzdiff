package lib

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

func Build(c *Config, isRemote *bool) {
	var wg sync.WaitGroup
	destDir := ""
	var targets = []BuildTarget{}
	if *isRemote { // with branch option
		slog.Debug("Build remotely")
		if c.RemoteUri == "" {
			panic("remote_uri is not set")
		}
		destDir = c.GetRemoteOutputDir()
		targets = ListBuildRemoteTargets(c, c.RemoteUri)
	} else { // withou branch option
		slog.Debug("Build locally")
		destDir = c.GetCurrentOutputDir()
		targets = ListBuildTargets(c)
	}
	slog.Debug("destDir:" + destDir)
	os.MkdirAll(destDir, 0755)
	for _, t := range targets {
		wg.Add(1)
		go func(t BuildTarget) {
			defer wg.Done()
			cmd := KustomizeCommandBuilder(c, t)
			slog.Debug(cmd.ToString())
			out, cmdErr := exec.Command(
				cmd.Bin, cmd.Args...).CombinedOutput()
			if cmdErr != nil {
				slog.Error(cmdErr.Error())
				panic(cmdErr)
			}
			outputFilename := ToFilename(filepath.Dir(t.Filename))
			writeErr := os.WriteFile(destDir+"/"+outputFilename, out, 0644)
			if writeErr != nil {
				slog.Error(writeErr.Error())
				panic(writeErr)
			}
			slog.Debug("written to " + destDir + "/" + outputFilename)
		}(t)
	}
	wg.Wait()
}

type BuildTarget struct {
	Filename string
	FullPath string
}

func ListBuildTargets(c *Config) []BuildTarget {
	entries, err := filepath.Glob(c.KustomziePathPattern)
	if err != nil {
		slog.Error(err.Error())
	}
	list := []BuildTarget{}
	for _, entry := range entries {
		list = append(list, BuildTarget{Filename: entry, FullPath: filepath.Dir(entry)})
	}
	slog.Debug("ListBuildTargets", slog.Any("list", list))
	return list
}

func ListBuildRemoteTargets(c *Config, uri string) []BuildTarget {
	entries, err := filepath.Glob(c.KustomziePathPattern)
	if err != nil {
		slog.Error(err.Error())
	}
	list := []BuildTarget{}
	// if token is not empty, then set token = ${TOKEN}@
	token := os.Getenv(c.GithubTokenName)
	if token != "" {
		slog.Debug(c.GithubTokenName + "is set")
		token = token + "@"
	}
	for _, entry := range entries {
		list = append(list, BuildTarget{Filename: entry, FullPath: `https://` + token + uri + "/" + filepath.Dir(entry)})
	}
	return list
}
