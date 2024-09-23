package cmd

import (
	"context"
	"encoding/json"
	"flag"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/lib"
)

type Doctor struct {
	config lib.Config
}

func (*Doctor) Name() string     { return "doctor" } // サブコマンド名指定
func (*Doctor) Synopsis() string { return "check kzdiff status" }
func (*Doctor) Usage() string {
	return `doctor:
	Check kzdiff is ready to run.
`
}

func (p *Doctor) SetFlags(f *flag.FlagSet) {
	lib.SetCommonFlags(f, &p.config)
}

func (p *Doctor) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	config := lib.LoadConfig(&p.config)
	jsonConfig, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		panic(err)
	}
	println("config:\n", string(jsonConfig))
	println("kzdiff is ready")
	return subcommands.ExitSuccess
}
