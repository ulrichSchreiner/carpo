package workspace

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"github.com/ulrichSchreiner/gdbmi"
	"io"
	"log"
	"strings"
)

type debugEvent string

const (
	ev_console debugEvent = "console"
	ev_async              = "async"
)

type gdbjsonevent struct {
	gdbmi.GDBEvent
	TypeName string `json:"typeName"`
	StopName string `json:"stopName"`
}

type message struct {
	DebuggerEvent debugEvent                   `json:"debuggerEvent"`
	Console       *gdbmi.GDBTargetConsoleEvent `json:"console"`
	Event         *gdbjsonevent                `json:"event"`
}

func (ws *workspace) debug(lc *launchConfig) (*gdbmi.GDB, error) {
	gdb := gdbmi.NewGDB("gdb")
	if err := gdb.Start(lc.executable); err != nil {
		return nil, err
	}
	//cmd := exec.Command(lc.executable, lc.parameters...)
	//cmd.Dir = lc.workingDirectory
	//cmd.Env = lc.environment
	return gdb, nil
}

func debugProcessHandler(wks *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		location := ws.Config().Location.Path
		parts := strings.Split(location, "/")
		launchid := parts[len(parts)-1]
		lc, err := wks.getLaunchConfig(launchid)
		if err != nil {
			log.Printf("Error in debugProcessHandler: %v", err)
		} else {
			gdb, err := wks.debug(lc)
			if err != nil {
				log.Printf("Error starting gdb: %s", err)
				return
			}
			wks.putProcess(gdb.DebuggerProcess)
			io.WriteString(ws, fmt.Sprintf("%d\n", gdb.DebuggerProcess.Pid))
			_, err = gdb.Exec_run(false, nil)
			if err == nil {
				enc := json.NewEncoder(ws)
				go func() {
					for {
						select {
						case tev := <-gdb.Target:
							if err = enc.Encode(targetConsoleMessage(&tev)); err != nil {
								log.Printf("cannot json-encode message: %s (%+v)", err, tev)
							}
						case ev := <-gdb.Event:
							log.Printf("received: %+v", ev)
							if err = enc.Encode(eventMessage(&ev)); err != nil {
								log.Printf("cannot json-encode message: %s (%+v)", err, ev)
							}
							if ev.StopReason == gdbmi.Async_stopped_exited ||
								ev.StopReason == gdbmi.Async_stopped_exited_normally ||
								ev.StopReason == gdbmi.Async_stopped_exited_signalled {
								log.Printf("exit received: %+v", ev)
								gdb.Gdb_exit()
								return
							} else {
							}
						}
					}
				}()
			}
			if _, err = gdb.DebuggerProcess.Wait(); err != nil {
				log.Printf("Error waiting for process: %s", err)
			}
			wks.removeProcess(gdb.DebuggerProcess)
			log.Printf("LC '%+v' ended", lc)
		}
	}
}

func targetConsoleMessage(ev *gdbmi.GDBTargetConsoleEvent) message {
	return message{ev_console, ev, nil}
}

func eventMessage(ev *gdbmi.GDBEvent) message {
	jev := gdbjsonevent{*ev, ev.Type.String(), ev.StopReason.String()}
	return message{ev_async, nil, &jev}
}
