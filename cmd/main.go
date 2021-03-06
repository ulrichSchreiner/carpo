package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/ulrichSchreiner/carpo/client"
	"github.com/ulrichSchreiner/carpo/workspace"
	"launchpad.net/loggo"
)

var port = flag.Int("port", 8787, "the port to use for carpo")
var clientpath = flag.String("clientpath", "", "the path to the client resource directory (should contain an index.html file)")
var wks = flag.String("workspace", "", "the path to the workspace")
var browser = flag.Bool("browser", false, "start a browser with the server URL")
var loglevel = flag.String("loglevel", "TRACE", "root loglevel")

var carpo_version string

var logger = loggo.GetLogger("main")

func main() {
	flag.Parse()

	loggo.ConfigureLoggers(fmt.Sprintf("<root>=%s", *loglevel))
	if carpo_version == "" {
		carpo_version = fmt.Sprintf("%d", time.Now().Unix())
	}
	logger.Infof("carpo '%s' started at port %d...\n", carpo_version, *port)

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
	err := workspace.NewWorkspace(*ws, carpo_version)
	if err != nil {
		log.Fatal(err)
	}
	l, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatal(err)
	}
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
