package lib

import (
	"fmt"
	"log/slog"
	"os"
)

func Init(c *Config) {
	filename := "kzdiff.ini"
	if _, err := os.Stat(filename); err == nil {
		slog.Info(filename + " is already exists")
		return
	}
	content := fmt.Sprintf(
		"[kzdiff]\n" +
			"dyff_path=dyff\n" +
			"dyff_between_options=--omit-header,--ignore-order-changes\n" +
			"kustomize_build_options=--enable-helm,--load-restrictor,LoadRestrictionsNone\n" +
			"remote_uri=github.com/owner/repo\n" +
			"compared_branch=main\n" +
			"github_token_name=GITHUB_TOKEN\n" +
			"kustomize_path_pattern=overlays/**/kustomization.(yaml|yml)\n" +
			"history_size=10\n" +
			"tmp_dir_path=./tmp/\n" +
			"workspace_name=kzdiff\n" +
			"debug=false\n",
	)
	err := os.WriteFile(filename, []byte(content), 0644)
	if err != nil {
		slog.Error(err.Error())
	}
}
