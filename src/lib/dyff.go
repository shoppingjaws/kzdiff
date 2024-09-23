package lib

import (
	"log/slog"
	"os"
	"os/exec"
	"sync"
)

func DyffBetweenCommandBuilder(c Config, fromPath string, toPath string) Command {
	dyff := c.DyffPath
	// between --options fromPath toPath
	args := []string{"between"}
	args = append(args, c.DyffBetweenOptions...)
	args = append(args, fromPath, toPath)
	return Command{
		Bin:  dyff,
		Args: args,
	}
}

func Compare(c Config, fromPath string, toPath string) {
	updated, deleted, created := ListBuildResults(c, fromPath, toPath)
	if len(updated)+len(deleted)+len(created) == 0 {
		slog.Debug("Comparing with " + fromPath + " and " + toPath)
		panic("No build results. run kzdiff build")
	}
	os.Mkdir(GetOutputDir(&c), 0755)
	var wg sync.WaitGroup
	for _, u := range updated {
		wg.Add(1)
		go func(u os.DirEntry) {
			defer wg.Done()
			cmd := DyffBetweenCommandBuilder(c, GetCurrentLatestDir(&c)+"/"+u.Name(), GetRemoteDir(&c)+"/"+u.Name())
			slog.Info(cmd.ToString())
			out, cmdErr := exec.Command(
				cmd.Bin, cmd.Args...).CombinedOutput()
			if cmdErr != nil {
				slog.Error(cmdErr.Error())
				panic(cmdErr)
			}
			// skip to write if output is empty
			if len(out) <= 1 {
				return
			}
			outputFilename := ToFilename(u.Name())
			writeErr := os.WriteFile(GetOutputDir(&c)+outputFilename, out, 0644)
			if writeErr != nil {
				slog.Error(writeErr.Error())
				panic(writeErr)
			}
			slog.Debug("written to " + GetOutputDir(&c) + outputFilename)
		}(u)
	}
	wg.Wait()
}
