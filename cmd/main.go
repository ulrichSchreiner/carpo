package main

import (
	"flag"
	"fmt"
	_ "github.com/ulrichSchreiner/carpo/client"
	_ "github.com/ulrichSchreiner/carpo/parser"
	"github.com/ulrichSchreiner/carpo/server"
	"github.com/ulrichSchreiner/carpo/workspace"
	"log"
	"os"
)

var port = flag.Int("port", 8787, "the port to use for carpo")

func main() {
	flag.Parse()
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	err = workspace.NewWorkspace(wd)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("carpo started at port %d...\n", *port)
	server.Start(*port)
}
