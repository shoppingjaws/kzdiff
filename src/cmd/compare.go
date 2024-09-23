package cmd

import (
	"context"
	"flag"
	"log/slog"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Compare struct {
	config lib.Config
}

func (*Compare) Name() string     { return "compare" } // サブコマンド名指定
func (*Compare) Synopsis() string { return "compare" }
func (*Compare) Usage() string {
	return `compare:
	Compare the build result.
`
}

func (p *Compare) SetFlags(f *flag.FlagSet) {
	lib.SetCommonFlags(f, &p.config)
}

func (p *Compare) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	slog.Debug(p.config.DyffPath)
	config := lib.LoadConfig(&p.config)
	fromPath := lib.GetRemoteDir(&config)
	toPath := lib.GetCurrentLatestDir(&config)
	lib.Compare(config, fromPath, toPath)
	return subcommands.ExitSuccess
}
