package main

import (
	"os"

	"github.com/istudio/server/internal/app"
)

func main() {
	os.Exit(app.Run(os.Args[1:]))
}
