package workspace

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
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
	TypeName   string  `json:"typeName"`
	StopName   string  `json:"stopName"`
	Filesystem *string `json:"filesystem"`
	Path       *string `json:"path"`
}

type message struct {
	DebuggerEvent debugEvent    `json:"debuggerEvent"`
	Event         *gdbjsonevent `json:"event"`
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

func debugConsoleHandler(wks *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		location := ws.Config().Location.Path
		parts := strings.Split(location, "/")
		spid := parts[len(parts)-1]
		var pid int
		fmt.Sscanf(spid, "%d", &pid)
		gdb := wks.debugSession[pid]
		if gdb != nil {
			clientqueue := make(chan interface{})
			quit := make(chan bool)
			enc := json.NewEncoder(ws)
			go func() {
				for {
					select {
					case m := <-clientqueue:
						if err := enc.Encode(m); err != nil {
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
					case ev := <-gdb.Event:
						if ev.StopReason == gdbmi.Async_stopped_exited ||
							ev.StopReason == gdbmi.Async_stopped_exited_normally ||
							ev.StopReason == gdbmi.Async_stopped_exited_signalled {
							log.Printf("exit received: %+v", ev)
							gdb.Gdb_exit()
							go func() {
								clientqueue <- eventMessage(&ev, wks.filesystems)
								quit <- true
							}()
							return
						} else {
							go func() {
								clientqueue <- eventMessage(&ev, wks.filesystems)
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
					case "next":
						gdb.Exec_next(false)
					case "step":
						gdb.Exec_step(false)
					case "return":
						gdb.Exec_finish(false)
					}
				}
			}()
			if _, err := gdb.DebuggerProcess.Wait(); err != nil {
				log.Printf("Error waiting for process: %s", err)
			}
			wks.removeProcess(gdb.DebuggerProcess)
			delete(wks.debugSession, gdb.DebuggerProcess.Pid)
		}
	}
}

func fetchCurrentDebugState(gdb *gdbmi.GDB) {
	// fetch current stack data
	// stack-list-arguments
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
			wks.debugSession[gdb.DebuggerProcess.Pid] = gdb
			io.WriteString(ws, fmt.Sprintf("%d\n", gdb.DebuggerProcess.Pid))
			_, err = gdb.Exec_run(false, nil)

			if err == nil {
				io.Copy(ws, gdb.TargetConsoleOut)
			}
		}
	}
}

func eventMessage(ev *gdbmi.GDBEvent, fs map[string]filesystem.WorkspaceFS) message {
	jev := gdbjsonevent{*ev, ev.Type.String(), ev.StopReason.String(), nil, nil}
	if ev.CurrentStackFrame != nil {
		fs, rel, err := filesystem.FindFilesystem(ev.CurrentStackFrame.Fullname, fs)
		if err == nil {
			fsn := fs.Name()
			jev.Filesystem = &fsn
			jev.Path = &rel
		}
	}
	return message{ev_async, &jev}
}
