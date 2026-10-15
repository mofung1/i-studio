// Package config reads deployment configuration without initializing services.
package config

import "net"

type Runtime struct {
	DatabaseURL string
	StorageRoot string
	APIHost     string
	APIPort     string
}

func FromEnvironment() Runtime {
	return Runtime{
		DatabaseURL: Env("DATABASE_URL", ""),
		StorageRoot: Env("STORAGE_ROOT", "storage/uploads"),
		APIHost:     Env("API_HOST", "127.0.0.1"),
		APIPort:     Env("API_PORT", "4000"),
	}
}

func (c Runtime) ListenAddress() string { return net.JoinHostPort(c.APIHost, c.APIPort) }
