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

type breakpoint struct {
	filesystem string
	source     string
	line       int
}

type breakpoint_cmd struct {
	Command string `json:"command"`
	Data    json.RawMessage
}

func (ws *workspace) breakpoints() []breakpoint {
	var result []breakpoint
	conf, ok := ws.config["debugger"]
	if ok {
		debugsettings := conf.(map[string]interface{})
		bps, ok := debugsettings["breakpoints"]
		if ok {
			bpmap := bps.(map[string]interface{})
			for _, v := range bpmap {
				bplist := v.([]interface{})
				for _, bp := range bplist {
					bpitem, ok := bp.(map[string]interface{})
					if ok {
						bp := new(breakpoint)
						bp.filesystem = bpitem["filesystem"].(string)
						fs, ok := ws.filesystems[bp.filesystem]
						if ok {
							// add breakpoint only if filesystem is known
							bp.source = fs.Abs(bpitem["source"].(string))
							bp.line = int(bpitem["line"].(float64))
							result = append(result, *bp)
						}
					}
				}
			}
		}
	}

	return result
}

func (ws *workspace) debug(lc *launchConfig) (*gdbmi.GDB, error) {
	gdb := gdbmi.NewGDB("gdb")
	if err := gdb.Start(lc.executable); err != nil {
		log.Printf("error start target: %+v", err)
		return nil, err
	}
	breakpoints := ws.breakpoints()
	for _, bp := range breakpoints {
		_, err := gdb.Breakpoint(bp.source, bp.line)
		if err != nil {
			log.Printf("error set BP: %+v", err)
		}
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
				clientqueue := make(chan interface{})
				quit := make(chan bool)
				enc := json.NewEncoder(ws)
				go func() {
					for {
						select {
						case m := <-clientqueue:
							if err = enc.Encode(m); err != nil {
								log.Printf("cannot json-encode message: %s (%+v)", err, m)
							}
						case <-quit:
							close(clientqueue)
							return
						}
					}
				}()
				go func() {
					for {
						select {
						case tev := <-gdb.Target:
							go func() {
								clientqueue <- targetConsoleMessage(&tev)
							}()
						case ev := <-gdb.Event:
							if ev.StopReason == gdbmi.Async_stopped_exited ||
								ev.StopReason == gdbmi.Async_stopped_exited_normally ||
								ev.StopReason == gdbmi.Async_stopped_exited_signalled {
								log.Printf("exit received: %+v", ev)
								gdb.Gdb_exit()
								go func() {
									clientqueue <- eventMessage(&ev)
									quit <- true
								}()
								return
							} else {
								go func() {
									clientqueue <- eventMessage(&ev)
								}()
							}
						}
					}
				}()
				dec := json.NewDecoder(ws)
				go func() {
					for {
						var cmd breakpoint_cmd
						err := dec.Decode(&cmd)
						if err != nil {
							log.Printf("Error reading client debugger command %+v", err)
							return
						}
						log.Printf(" -> %+v", cmd)
						switch cmd.Command {
						case "run":
							gdb.Exec_continue(true, false, nil)
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
