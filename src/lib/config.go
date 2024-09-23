package lib

import (
	"flag"
	"log/slog"
	"os"
	"path/filepath"

	ini "gopkg.in/ini.v1"
)

type Config struct {
	DyffPath              string
	DyffBetweenOptions    []string
	KustomziePathPattern  string
	KustomizeBuildOptions []string
	TmpDirPath            string
	RemoteUri             string
	ComparedBranch        string
	GithubTokenName       string
	WorkspaceName         string
	HistorySize           int
	Debug                 bool
}

// Configファイル読み込み
func LoadConfig(c *Config) Config {
	// load kzdiff.ini file
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
	var dyffPath string
	dyffPath = section.Key("dyff_path").MustString("dyff")
	if c.DyffPath != "" {
		dyffPath = c.DyffPath
	}

	// DyffBetweenOptions
	var dyffBetweenOptions []string
	dyffBetweenOptions = section.Key("dyff_between_options").Strings(",")
	if len(c.DyffBetweenOptions) > 0 {
		dyffBetweenOptions = c.DyffBetweenOptions
	}

	// KustomizePathPattern
	var kustomizePathPattern string
	kustomizePathPattern = section.Key("kustomize_path_pattern").MustString("overlays/**/kustomization.(yaml|yml)")
	if c.KustomziePathPattern != "" {
		kustomizePathPattern = c.KustomziePathPattern
	}

	// KustomizeBuildOptions
	var kustomizeBuildOptions []string
	kustomizeBuildOptions = section.Key("kustomize_build_options").Strings(",")
	if len(c.KustomizeBuildOptions) > 0 {
		kustomizeBuildOptions = c.KustomizeBuildOptions
	}

	// TmpDirPath
	var tmpDirPath string
	tmpDirPath = section.Key("tmp_dir_path").MustString(os.Getenv("TMPDIR"))
	if c.TmpDirPath != "" {
		tmpDirPath = c.TmpDirPath
	}
	// RemoteUri
	var remoteUri string
	remoteUri = section.Key("remote_uri").MustString("")
	if c.RemoteUri != "" {
		remoteUri = c.RemoteUri
	}

	// ComparedBranch
	var comparedBranch string
	comparedBranch = section.Key("compared_branch").MustString("main")
	if c.ComparedBranch != "" {
		comparedBranch = c.ComparedBranch
	}

	// TokenName
	var githubTokenName string
	githubTokenName = section.Key("token_name").MustString("GITHUB_TOKEN")
	if c.GithubTokenName != "" {
		githubTokenName = c.GithubTokenName
	}

	// WorkspaceName
	var workspaceName string
	currentDir, err := os.Getwd()
	if err != nil {
		slog.Error(err.Error())
	}
	dirName := filepath.Base(currentDir)
	workspaceName = section.Key("workspace_name").MustString(dirName)
	if c.WorkspaceName != "" {
		workspaceName = c.WorkspaceName
	}

	// HistorySize
	var historySize int
	historySize = section.Key("history_size").MustInt(10)
	if c.HistorySize != 0 {
		historySize = c.HistorySize
	}
	// Debug
	var debug bool
	debug = section.Key("debug").MustBool(false)
	if c.Debug {
		debug = c.Debug
	}

	config := Config{
		DyffPath:              dyffPath,
		DyffBetweenOptions:    dyffBetweenOptions,
		KustomziePathPattern:  kustomizePathPattern,
		KustomizeBuildOptions: kustomizeBuildOptions,
		TmpDirPath:            tmpDirPath,
		RemoteUri:             remoteUri,
		ComparedBranch:        comparedBranch,
		GithubTokenName:       githubTokenName,
		WorkspaceName:         workspaceName,
		HistorySize:           historySize,
		Debug:                 debug,
	}
	if config.Debug {
		slog.SetLogLoggerLevel(slog.LevelDebug)
		slog.Debug("Config loaded", slog.Any("config", config))
	}
	return config
}

func (c *Config) GetCurrentOutputDir() string {
	return (c.TmpDirPath + c.WorkspaceName + "/current/" + GetTiemstamp())
}
func (c *Config) GetRemoteOutputDir() string {
	return (c.TmpDirPath + c.WorkspaceName + "/remote/" + c.ComparedBranch)
}

func SetCommonFlags(f *flag.FlagSet, c *Config) {
	f.StringVar(&c.DyffPath, "dyff_path", "", "dyff command path")
	f.StringVar(&c.KustomziePathPattern, "kustomize_path_pattern", "", "kustomize path pattern")
	f.StringVar(&c.TmpDirPath, "tmp_dir_path", "", "tmp dir path. default is $TMPDIR")
	f.StringVar(&c.RemoteUri, "remote_uri", "", "remote uri")
	f.StringVar(&c.ComparedBranch, "compared_branch", "main", "compared branch")
	f.StringVar(&c.GithubTokenName, "github_token_name", "", "github token environment variable name")
	f.StringVar(&c.WorkspaceName, "workspace_name", "", "workspace name")
	f.IntVar(&c.HistorySize, "history_size", 0, "history size")
	f.BoolVar(&c.Debug, "debug", false, "debug mode")
}
