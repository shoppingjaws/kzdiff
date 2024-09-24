package lib

import (
	"flag"
	"log/slog"
	"os"

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
func LoadConfig(args *Config) Config {
	// load kzdiff.ini file
	var kzdiff_config_path string
	kzdiff_config_path = os.Getenv("KZDIFF_CONFIG_PATH")
	if kzdiff_config_path == "" {
		kzdiff_config_path = "kzdiff.ini"
	}
	cfg, err := ini.Load(kzdiff_config_path)
	var iniConfig = Config{
		DyffPath:              "dyff",
		DyffBetweenOptions:    []string{},
		KustomziePathPattern:  "overlays/**/kustomization.(yaml|yml)",
		KustomizeBuildOptions: []string{},
		TmpDirPath:            os.Getenv("TMPDIR"),
		RemoteUri:             "",
		ComparedBranch:        "main",
		GithubTokenName:       os.Getenv("GITHUB_TOKEN"),
		WorkspaceName:         "kzdiff",
		HistorySize:           10,
		Debug:                 false,
	}
	if err == nil {
		section, err := cfg.GetSection("kzdiff")
		if err != nil {
			panic(err)
		}
		iniConfig = Config{
			DyffPath:              section.Key("dyff_path").MustString(""),
			DyffBetweenOptions:    section.Key("dyff_between_options").Strings(","),
			KustomziePathPattern:  section.Key("kustomize_path_pattern").MustString(""),
			KustomizeBuildOptions: section.Key("kustomize_build_options").Strings(","),
			TmpDirPath:            section.Key("tmp_dir_path").MustString(""),
			RemoteUri:             section.Key("remote_uri").MustString(""),
			ComparedBranch:        section.Key("compared_branch").MustString(""),
			GithubTokenName:       section.Key("github_token_name").MustString(""),
			WorkspaceName:         section.Key("workspace_name").MustString(""),
			HistorySize:           section.Key("history_size").MustInt(0),
			Debug:                 section.Key("debug").MustBool(false),
		}
		// load config and set default values
	}

	// DyffPath
	var dyffPath string
	dyffPath = iniConfig.DyffPath
	if args.DyffPath != "" {
		dyffPath = args.DyffPath
	}

	// DyffBetweenOptions
	var dyffBetweenOptions []string
	dyffBetweenOptions = iniConfig.DyffBetweenOptions
	if len(args.DyffBetweenOptions) > 0 {
		dyffBetweenOptions = args.DyffBetweenOptions
	}

	// KustomizePathPattern
	var kustomizePathPattern string
	kustomizePathPattern = iniConfig.KustomziePathPattern
	if args.KustomziePathPattern != "" {
		kustomizePathPattern = args.KustomziePathPattern
	}

	// KustomizeBuildOptions
	var kustomizeBuildOptions []string
	kustomizeBuildOptions = iniConfig.KustomizeBuildOptions
	if len(args.KustomizeBuildOptions) > 0 {
		kustomizeBuildOptions = args.KustomizeBuildOptions
	}

	// TmpDirPath
	var tmpDirPath string
	tmpDirPath = iniConfig.TmpDirPath
	if args.TmpDirPath != "" {
		tmpDirPath = args.TmpDirPath
	}
	// RemoteUri
	var remoteUri string
	remoteUri = iniConfig.RemoteUri
	if args.RemoteUri != "" {
		remoteUri = args.RemoteUri
	}

	// ComparedBranch
	var comparedBranch string
	comparedBranch = iniConfig.ComparedBranch
	if args.ComparedBranch != "" {
		comparedBranch = args.ComparedBranch
	}

	// TokenName
	var githubTokenName string
	githubTokenName = iniConfig.GithubTokenName
	if args.GithubTokenName != "" {
		githubTokenName = args.GithubTokenName
	}

	// WorkspaceName
	var workspaceName string
	// currentDir, err := os.Getwd()
	// if err != nil {
	// 	slog.Error(err.Error())
	// }
	// dirName := filepath.Base(currentDir)
	workspaceName = iniConfig.WorkspaceName
	if args.WorkspaceName != "" {
		workspaceName = args.WorkspaceName
	}

	// HistorySize
	var historySize int
	historySize = iniConfig.HistorySize
	if args.HistorySize != 0 {
		historySize = args.HistorySize
	}
	// Debug
	var debug bool
	debug = iniConfig.Debug
	if args.Debug {
		debug = args.Debug
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
