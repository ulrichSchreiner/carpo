package main

import (
	"flag"
	"fmt"
	"github.com/ulrichSchreiner/carpo/client"
	_ "github.com/ulrichSchreiner/carpo/parser"
	"github.com/ulrichSchreiner/carpo/workspace"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
)

var port = flag.Int("port", 8787, "the port to use for carpo")
var clientpath = flag.String("clientpath", "", "the path to the client resource directory (should contain an index.html file)")
var wks = flag.String("workspace", "", "the path to the workspace")
var browser = flag.Bool("browser", false, "start a browser with the server URL")

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
	if len([]byte(*clientpath)) > 0 {
		client.Init(*clientpath)
	} else {
		client.InitResources()
	}
	err := workspace.NewWorkspace(*ws)
	if err != nil {
		log.Fatal(err)
	}
	l, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("carpo started at port %d...\n", *port)
	if *browser {
		startBrowser(fmt.Sprintf("http://localhost:%d", *port))
	}
	http.Serve(l, nil)
}

func startBrowser(url string) bool {
	var args []string
	switch runtime.GOOS {
	case "darwin":
		args = []string{"open"}
	case "windows":
		args = []string{"cmd", "/c", "start"}
	default:
		args = []string{"xdg-open"}
	}
	cmd := exec.Command(args[0], append(args[1:], url)...)
	return cmd.Start() == nil
}
