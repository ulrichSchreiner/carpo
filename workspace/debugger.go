package workspace

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
	"github.com/ulrichSchreiner/gdbmi"
	"io"
	"launchpad.net/loggo"
	"strings"
)

type debugEvent string

var debuglogger = loggo.GetLogger("workspace.debugger")

const (
	ev_async = "async"
	ev_data  = "data"
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
	Data          *interface{}  `json:"data"`
}

type breakpoint struct {
	filesystem string
	source     string
	line       int
}

type breakpoint_cmd struct {
	Command string          `json:"command"`
	Data    json.RawMessage `json:"data"`
}

type debugger_state struct {
	Frames    []gdbmi.StackFrame    `json:"frames"`
	Variables []gdbmi.FrameArgument `json:"variables"`
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
		debuglogger.Errorf("error start target: %+v", err)
		return nil, err
	}
	_, err := gdb.SetAsync()
	if err != nil {
		debuglogger.Errorf("cannot set async mode: %s", err)
		return nil, err
	}
	breakpoints := ws.breakpoints()
	for _, bp := range breakpoints {
		_, err := gdb.Breakpoint(bp.source, bp.line)
		if err != nil {
			debuglogger.Errorf("error set BP: %+v", err)
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
							debuglogger.Errorf("cannot json-encode message: %s (%+v)", err, m)
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
							debuglogger.Infof("exit received: %+v", ev)
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
						debuglogger.Infof("cannot read client debugger command '%+v', ending session", err)
						return
					}
					debuglogger.Tracef("client command received -> %+v", cmd)
					switch cmd.Command {
					case "quit":
						gdb.Gdb_exit()
					case "continue":
						gdb.Exec_continue(true, false, nil)
					case "next":
						gdb.Exec_next(false)
					case "step":
						gdb.Exec_step(false)
					case "return":
						gdb.Exec_finish(false)
					case "add-breakpoint":
						debuglogger.Debugf("add Breakpoint: %+v", cmd)
						if er := wks.addBreakpoint(&cmd, gdb); er != nil {
							debuglogger.Errorf("cannot set breakpoint: %s", er)
						}
					case "remove-breakpoint":
						debuglogger.Debugf("remove Breakpoint: %+v", cmd)
						if er := wks.removeBreakpoint(&cmd, gdb); er != nil {
							debuglogger.Errorf("cannot remove breakpoint: %s", er)
						}
					case "state":
						st := fetchCurrentDebugState(gdb)
						clientqueue <- dataMessage(st)
					}
				}
			}()
			if _, err := gdb.DebuggerProcess.Wait(); err != nil {
				debuglogger.Errorf("Error waiting for process: %s", err)
			}
			wks.removeProcess(gdb.DebuggerProcess)
			delete(wks.debugSession, gdb.DebuggerProcess.Pid)
		}
	}
}

type breakpoint_data struct {
	Filesystem string `json:"filesystem"`
	Source     string `json:"source"`
	Line       int    `json:"line"`
}

func (wks *workspace) removeBreakpoint(cmd *breakpoint_cmd, gdb *gdbmi.GDB) error {
	bp := new(breakpoint_data)
	if err := json.Unmarshal(cmd.Data, bp); err != nil {
		return err
	}
	fs := wks.filesystems[bp.Filesystem]
	abspath := fs.Abs(bp.Source)
	debuglogger.Tracef("remove breakpoint from %s:%d", abspath, bp.Line)
	_, err := gdb.Exec_interrupt(true, nil)
	if err != nil {
		return err
	}
	defer gdb.Exec_continue(true, false, nil)
	bplist, err := gdb.Break_list()
	if err != nil {
		return err
	}
	for _, bpt := range *bplist {
		if bpt.Fullname == abspath && bpt.Line == bp.Line {
			if _, err := gdb.Break_delete(bpt.Number); err != nil {
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("breakpoint %s:%d not found", abspath, bp.Line)
}

func (wks *workspace) addBreakpoint(cmd *breakpoint_cmd, gdb *gdbmi.GDB) error {
	bp := new(breakpoint_data)
	if err := json.Unmarshal(cmd.Data, bp); err != nil {
		return err
	}
	fs := wks.filesystems[bp.Filesystem]
	abspath := fs.Abs(bp.Source)
	debuglogger.Tracef("set breakpoint to %s:%d", abspath, bp.Line)
	_, err := gdb.Exec_interrupt(true, nil)
	if err != nil {
		return err
	}
	defer gdb.Exec_continue(true, false, nil)
	bpkt, err := gdb.Breakpoint(abspath, bp.Line)
	if err != nil {
		return nil
	}
	debuglogger.Infof("new breakpoint set: %+v", bpkt)
	return nil
}

func fetchCurrentDebugState(gdb *gdbmi.GDB) debugger_state {
	var state debugger_state
	frames, err := gdb.Stack_list_allframes()
	if err == nil {
		state.Frames = *frames
	}
	vars, err := gdb.Stack_list_variables(gdbmi.ListType_all_values)
	if err == nil {
		state.Variables = *vars
	}
	return state
}

func debugProcessHandler(wks *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		location := ws.Config().Location.Path
		parts := strings.Split(location, "/")
		launchid := parts[len(parts)-1]
		lc, err := wks.getLaunchConfig(launchid)
		if err != nil {
			debuglogger.Errorf("Error in debugProcessHandler: %v", err)
		} else {
			gdb, err := wks.debug(lc)
			if err != nil {
				debuglogger.Errorf("Error starting gdb: %s", err)
				return
			}
			wks.putProcess(gdb.DebuggerProcess)
			wks.debugSession[gdb.DebuggerProcess.Pid] = gdb
			io.WriteString(ws, fmt.Sprintf("%d\n", gdb.DebuggerProcess.Pid))
			_, err = gdb.Exec_run(false, false, nil)

			if err == nil {
				io.Copy(ws, gdb.TargetConsoleOut)
			}
		}
	}
}

func dataMessage(data interface{}) message {
	return message{ev_data, nil, &data}
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
	return message{ev_async, &jev, nil}
}
