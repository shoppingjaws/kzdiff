package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Build struct {
	config    lib.Config
	remoteUri string
}

func (*Build) Name() string     { return "build" } // サブコマンド名指定
func (*Build) Synopsis() string { return "run kustomize build in pararell" }
func (*Build) Usage() string {
	return `build [-remote_uri]:
	run kustomize build.
`
}

func (p *Build) SetFlags(f *flag.FlagSet) {
	f.StringVar(&p.remoteUri, "remote_uri", "", "build with remote repository uri (e.g. github.com/owner/repo)")
	lib.SetCommonFlags(f, &p.config)
}

func (p *Build) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	config := lib.LoadConfig(&p.config)
	lib.Build(&config, &p.remoteUri)
	return subcommands.ExitSuccess
}
