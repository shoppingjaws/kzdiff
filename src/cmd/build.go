package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Build struct {
	remote bool
}

func (*Build) Name() string     { return "build" } // サブコマンド名指定
func (*Build) Synopsis() string { return "run kustomize build in pararell" }
func (*Build) Usage() string {
	return `build [-remote]:
	run kustomize build.
`
}

func (p *Build) SetFlags(f *flag.FlagSet) {
	f.BoolVar(&p.remote, "remote", false, "build with remote repository")
}

func (p *Build) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	lib.Build(lib.LoadConfig(), p.remote)
	return subcommands.ExitSuccess
}
