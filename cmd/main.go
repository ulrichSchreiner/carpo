package main

import (
	"fmt"
	_ "github.com/ulrichSchreiner/carpo/client"
	_ "github.com/ulrichSchreiner/carpo/parser"
	"github.com/ulrichSchreiner/carpo/server"
	"github.com/ulrichSchreiner/carpo/workspace"
	"log"
	"os"
)

func main() {
	fmt.Println("carpo started ...")
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	err = workspace.NewWorkspace(wd)
	if err != nil {
		log.Fatal(err)
	}
	server.Start()
	//parser.Parse()
}
