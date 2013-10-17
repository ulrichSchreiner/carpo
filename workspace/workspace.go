package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"github.com/howeyc/fsnotify"
	"log"
	"net/http"
	"os"
)

type workspace struct {
	Path    string
	Watcher *fsnotify.Watcher
}

type fileevent struct {
	Name     string
	IsDir    bool
	Created  bool
	Deleted  bool
	Modified bool
	Renamed  bool
}

func NewWorkspace(path string) error {
	w := workspace{path, nil}
	http.Handle("/workspace", websocket.Handler(WorkspaceHandler(&w)))
	return nil
}

func transformEvent(ws *workspace, evt *fsnotify.FileEvent) (*fileevent, error) {
	var fe fileevent
	fi, err := os.Lstat(evt.Name)
	if err != nil {
		return nil, err
	}
	fe.Name = evt.Name[len(ws.Path):]
	fe.Created = evt.IsCreate()
	fe.Deleted = evt.IsDelete()
	fe.Modified = evt.IsModify()
	fe.Renamed = evt.IsRename()
	if fi.IsDir() {
		fe.IsDir = true
		if evt.IsCreate() {
			ws.Watcher.Watch(evt.Name)
		} else if evt.IsDelete() {
			ws.Watcher.RemoveWatch(evt.Name)
		}
	}
	return &fe, nil
}
func WorkspaceHandler(works *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		watcher, err := fsnotify.NewWatcher()
		if err != nil {
			log.Printf("Cannot create Watcher: %v\n", err)
			return
		}
		err = watcher.Watch(works.Path)
		log.Printf("Start watching %s ...\n", works.Path)
		if err != nil {
			log.Printf("Cannot start Watcher: %v\n", err)
			return
		}
		works.Watcher = watcher
		for {
			select {
			case ev := <-watcher.Event:
				//fmt.Fprintln(ws, "event:", ev)
				fe, err := transformEvent(works, ev)
				if err != nil {
					log.Printf("Error transforming event: %v", err)
				} else {
					websocket.JSON.Send(ws, fe)
				}
			case err := <-watcher.Error:
				fmt.Fprintln(ws, "error:", err)
				return
			}
		}
	}
}
