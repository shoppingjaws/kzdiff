package cmd

import (
	"context"
	"flag"

	"github.com/google/subcommands"
)

type Dyff struct {
}

func (*Dyff) Name() string     { return "Dyff" } // サブコマンド名指定
func (*Dyff) Synopsis() string { return "diff build results" }
func (*Dyff) Usage() string {
	return `diff:
	Dyff build results.
`
}

func (p *Dyff) SetFlags(f *flag.FlagSet) {
}

func (p *Dyff) Execute(_ context.Context, f *flag.FlagSet, _ ...interface{}) subcommands.ExitStatus {
	return subcommands.ExitSuccess
}
