package main

import (
	"context"
	"flag"
	"os"

	"github.com/google/subcommands"
	"github.com/shoppingjaws/kzdiff/src/cmd"
)

func main() {
	subcommands.Register(subcommands.HelpCommand(), "")
	subcommands.Register(subcommands.FlagsCommand(), "")
	subcommands.Register(subcommands.CommandsCommand(), "")
	subcommands.Register(&cmd.Doctor{}, "")
	subcommands.Register(&cmd.List{}, "")
	subcommands.Register(&cmd.Build{}, "")
	subcommands.Register(&cmd.Compare{}, "")
	flag.Parse()
	ctx := context.Background()
	os.Exit(int(subcommands.Execute(ctx)))
}
