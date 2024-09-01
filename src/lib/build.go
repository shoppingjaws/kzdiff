package lib

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

func BuildCurrent(c Config) {
	var wg sync.WaitGroup
	os.MkdirAll(c.GetOutputDir(), 0755)
	destDir := c.GetOutputDir()
	targets := ListBuildTargets(c)
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

func BuildRemote(c Config, branch string) {
	
}

type BuildTarget struct {
	Filename string
}

func ListBuildTargets(c Config) []BuildTarget {
	entries, err := filepath.Glob(c.KustomziePathPattern)
	if err != nil {
		slog.Error(err.Error())
	}
	list := []BuildTarget{}
	for _, entry := range entries {
		list = append(list, BuildTarget{Filename: entry})
	}
	return list
}
