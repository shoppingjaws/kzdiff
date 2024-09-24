package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Build struct {
	config lib.Config
	remote bool
}

func (*Build) Name() string     { return "build" } // サブコマンド名指定
func (*Build) Synopsis() string { return "run kustomize build locally / remotely (-remote_uri)" }
func (*Build) Usage() string {
	return `build [-remote_uri]:
	run kustomize build.
`
}

func (p *Build) SetFlags(f *flag.FlagSet) {
	lib.SetCommonFlags(f, &p.config)
	f.BoolVar(&p.remote, "remote", false, "build remotely")
}

func (p *Build) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	config := lib.LoadConfig(&p.config)
	lib.Build(&config, &p.remote)
	return subcommands.ExitSuccess
}
