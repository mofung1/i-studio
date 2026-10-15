package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDotEnvDoesNotOverrideDeploymentEnvironment(t *testing.T) {
	t.Setenv("ISTUDIO_CONFIG_FIXTURE_EXISTING", "deployment")
	t.Setenv("ISTUDIO_CONFIG_FIXTURE_QUOTED", "")
	t.Setenv("ISTUDIO_CONFIG_FIXTURE_SECOND", "")
	root := t.TempDir()
	first, second := filepath.Join(root, "first.env"), filepath.Join(root, "second.env")
	if err := os.WriteFile(first, []byte("# fixture\nISTUDIO_CONFIG_FIXTURE_EXISTING=file\nISTUDIO_CONFIG_FIXTURE_QUOTED='quoted value'\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(second, []byte("ISTUDIO_CONFIG_FIXTURE_SECOND=unexpected\n"), 0600); err != nil {
		t.Fatal(err)
	}
	LoadDotEnv(filepath.Join(root, "missing.env"), first, second)
	if os.Getenv("ISTUDIO_CONFIG_FIXTURE_EXISTING") != "deployment" || os.Getenv("ISTUDIO_CONFIG_FIXTURE_QUOTED") != "quoted value" || os.Getenv("ISTUDIO_CONFIG_FIXTURE_SECOND") != "" {
		t.Fatal("dotenv precedence changed")
	}
}

func TestRuntimeListenAddressSupportsIPv6(t *testing.T) {
	cfg := Runtime{APIHost: "::1", APIPort: "4000"}
	if cfg.ListenAddress() != "[::1]:4000" {
		t.Fatal(cfg.ListenAddress())
	}
}

func TestRepositoryRootNeverLoadsWorkspaceEnv(t *testing.T) {
	t.Setenv("ISTUDIO_CONFIG_FIXTURE_WORKSPACE", "")
	t.Setenv("ISTUDIO_CONFIG_FIXTURE_SERVER", "")
	t.Chdir(t.TempDir())
	if err := os.MkdirAll("server", 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(".env", []byte("ISTUDIO_CONFIG_FIXTURE_WORKSPACE=unexpected\n"), 0600); err != nil {
		t.Fatal(err)
	}
	LoadDotEnv()
	if os.Getenv("ISTUDIO_CONFIG_FIXTURE_WORKSPACE") != "" {
		t.Fatal("workspace .env was loaded")
	}
	if err := os.WriteFile("server/.env", []byte("ISTUDIO_CONFIG_FIXTURE_SERVER=api\n"), 0600); err != nil {
		t.Fatal(err)
	}
	LoadDotEnv()
	if os.Getenv("ISTUDIO_CONFIG_FIXTURE_SERVER") != "api" {
		t.Fatal("server .env was not loaded")
	}
}
