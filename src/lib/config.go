package lib

import (
	"log/slog"
	"os"
	"path/filepath"

	ini "gopkg.in/ini.v1"
)

type Config struct {
	DyffPath              string
	KustomziePathPattern  string
	KustomizeBuildOptions []string
	TmpDirPath            string
	ComparedBranch        string
	RepositoryName        string
	HistorySize           int
}

// Configファイル読み込み
func LoadConfig() Config {
	kzdiff_config_path := os.Getenv("KZDIFF_CONFIG_PATH")
	if kzdiff_config_path != "" {
		ini.Load(kzdiff_config_path)
	} else {
		kzdiff_config_path = "kzdiff.ini"
	}
	cfg, err := ini.Load(kzdiff_config_path)
	if err != nil {
		slog.Error(err.Error())
	}
	section, err := cfg.GetSection("kzdiff")
	if err != nil {
		slog.Error(err.Error())
	}
	// load config and set default values
	// DyffPath
	dyffPath := section.Key("dyff_path").MustString("dyff")
	// KustomizePathPattern
	kustomizePathPattern := section.Key("kustomize_path_pattern").MustString("overlays/**/kustomization.(yaml|yml)")
	// KustomizeOptions
	kustomizeBuildOptions := section.Key("kustomize_build_options").Strings(",")
	// TmpDirPath
	tmpDirPath := section.Key("tmp_dir_path").MustString(os.Getenv("TMPDIR"))
	// ComparedBranch
	comparedBranch := section.Key("compared_branch").MustString("main")
	// WorkspaceName
	currentDir, err := os.Getwd()
	if err != nil {
		slog.Error(err.Error())
	}
	dirName := filepath.Base(currentDir)
	workspaceName := section.Key("workspace_name").MustString(dirName)
	// HistorySize
	historySize := section.Key("history_size").MustInt(10)
	config := Config{
		DyffPath:              dyffPath,
		KustomziePathPattern:  kustomizePathPattern,
		KustomizeBuildOptions: kustomizeBuildOptions,
		TmpDirPath:            tmpDirPath,
		ComparedBranch:        comparedBranch,
		RepositoryName:        workspaceName,
		HistorySize:           historySize,
	}
	return config
}

func (c *Config) GetOutputDir() string {
	return (c.TmpDirPath + c.RepositoryName + "/" + "current/" + GetTiemstamp())
}
