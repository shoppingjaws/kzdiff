package lib

import "path/filepath"

type Command struct {
	Bin  string
	Args []string
}

func KustomizeCommandBuilder(c Config, t BuildTarget) Command {
	options := []string{"build"}
	options = append(options, c.KustomizeBuildOptions...)
	options = append(options, filepath.Dir(t.Filename))
	return Command{
		Bin:  "kustomize",
		Args: options,
	}
}

func (c *Command) ToString() string {
	res := c.Bin
	for _, arg := range c.Args {
		res += " " + arg
	}
	return res
}
