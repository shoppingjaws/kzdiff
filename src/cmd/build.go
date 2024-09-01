package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Build struct {
	branch string
}

func (*Build) Name() string     { return "build" } // サブコマンド名指定
func (*Build) Synopsis() string { return "run kustomize build in pararell" }
func (*Build) Usage() string {
	return `build [-branch] <branch name>:
	run kustomize build in pararell.
	without -branch option, run current branches.
`
}

func (p *Build) SetFlags(f *flag.FlagSet) {
	f.StringVar(&p.branch, "branch", "", "branch name")
}

func (p *Build) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	lib.BuildCurrent(lib.LoadConfig())
	return subcommands.ExitSuccess
}
