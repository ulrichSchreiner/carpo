package main

import (
	"flag"
	"fmt"
	"github.com/ulrichSchreiner/carpo/client"
	_ "github.com/ulrichSchreiner/carpo/parser"
	"github.com/ulrichSchreiner/carpo/server"
	"github.com/ulrichSchreiner/carpo/workspace"
	"log"
	"os"
)

var port = flag.Int("port", 8787, "the port to use for carpo")
var clientpath = flag.String("clientpath", "../html/app/", "the path to the client resource directory")
var wks = flag.String("workspace", "", "the path to the workspace")

func main() {
	flag.Parse()
	ws := wks
	if ws == nil {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatal(err)
		}
		ws = &wd
	}
	client.Init(*clientpath)
	err := workspace.NewWorkspace(*ws)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("carpo started at port %d...\n", *port)
	server.Start(*port)
}
