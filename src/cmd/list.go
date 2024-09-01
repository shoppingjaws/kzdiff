package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type List struct {
}

func (*List) Name() string     { return "list" } // サブコマンド名指定
func (*List) Synopsis() string { return "list all build targets" }
func (*List) Usage() string {
	return `list:
	List all build targets.
`
}

func (p *List) SetFlags(f *flag.FlagSet) {
}

func (p *List) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	config := lib.LoadConfig()
	list := lib.ListBuildTargets(config)
	println("build targets: ", len(list))
	for _, target := range list {
		println("\t- ", target.Filename)
	}
	return subcommands.ExitSuccess
}