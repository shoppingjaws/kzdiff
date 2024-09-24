package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Init struct {
	config lib.Config
}

func (*Init) Name() string     { return "init" } // サブコマンド名指定
func (*Init) Synopsis() string { return "setup command to generate kzdiff.ini" }
func (*Init) Usage() string {
	return `init:
	Setup command
`
}

func (p *Init) SetFlags(f *flag.FlagSet) {
	lib.SetCommonFlags(f, &p.config)
}

func (p *Init) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	config := lib.LoadConfig(&p.config)
	lib.Init(&config)
	return subcommands.ExitSuccess
}
