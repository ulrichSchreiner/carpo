package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io"
	"log"
	"strings"
)

func debugProcessHandler(wks *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		location := ws.Config().Location.Path
		parts := strings.Split(location, "/")
		launchid := parts[len(parts)-1]
		lc, err := wks.getLaunchConfig(launchid)
		if err != nil {
			log.Printf("Error in debugProcessHandler: %v", err)
		} else {
			cmd := wks.launch(lc)
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				log.Printf("Error no StdoutPipe: %s", err)
				return
			}
			stderr, err := cmd.StderrPipe()
			if err != nil {
				log.Printf("Error no StderrPipe: %s", err)
				return
			}
			stdin, err := cmd.StdinPipe()
			if err != nil {
				log.Printf("Error no StdinPipe: %s", err)
				return
			}
			if err := cmd.Start(); err != nil {
				log.Printf("Error when starting process: %s", err)
				return
			}
			wks.putProcess(cmd.Process)
			io.WriteString(ws, fmt.Sprintf("%d\n", cmd.Process.Pid))
			go func() {
				io.Copy(ws, stdout)
			}()
			go func() {
				io.Copy(ws, stderr)
			}()
			go func() {
				io.Copy(stdin, ws)
			}()
			if err := cmd.Wait(); err != nil {
				log.Printf("Error waiting for process: %s", err)
			}
			wks.removeProcess(cmd.Process)
			log.Printf("LC '%+v' ended", lc)
		}
	}
}
