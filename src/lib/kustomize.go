package lib

type Command struct {
	Bin  string
	Args []string
}

func KustomizeCommandBuilder(c Config, t BuildTarget) Command {
	options := []string{"build"}
	options = append(options, c.KustomizeBuildOptions...)
	options = append(options, t.FullPath)
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
