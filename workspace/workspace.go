package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"github.com/emicklei/go-restful"
	"github.com/howeyc/fsnotify"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (w *workspace) Register(container *restful.Container) {
	var ws restful.WebService
	ws.
		Path("/workspace").
		Consumes(restful.MIME_JSON).
		Produces(restful.MIME_JSON)
	//ws.Route(ws.GET("/dir?path={path}").To(w.dir).Writes(Dir{}))
	ws.Route(ws.GET("/dir").To(w.dir).Writes(Dir{}))
	container.Add(&ws)
}

type DirEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"dir"`
}
type Dir struct {
	Path        string     `json:"path"`
	PathEntries []string   `json:"pathentries"`
	Entries     []DirEntry `json:"entries"`
}

func (serv *workspace) dir(request *restful.Request, response *restful.Response) {
	cpath := request.QueryParameter("path")
	path := filepath.Join(serv.Path, cpath)
	var result Dir
	result.Path = cpath
	cp := cpath
	if cp[0] == os.PathSeparator {
		cp = cp[1:]
	}
	if len(cp) > 0 && cp[len(cp)-1] == os.PathSeparator {
		cp = cp[0 : len(cp)-1]
	}
	if len(cp) > 0 {
		result.PathEntries = strings.Split(cp, string(os.PathSeparator))
	} else {
		result.PathEntries = []string{}
	}
	f, err := os.Open(path)
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Cannot read '%s' parameter: %s", path, err)))
	} else {
		flz, err := f.Readdir(-1)
		if err != nil {
			response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Cannot read contents of '%s': %s", path, err)))
		} else {
			for _, fl := range flz {
				result.Entries = append(result.Entries, DirEntry{fl.Name(), fl.IsDir()})
			}
			response.WriteEntity(&result)
		}
	}
}

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

func Log(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func NewWorkspace(path string) error {
	w := workspace{path, nil}
	wsContainer := restful.NewContainer()
	w.Register(wsContainer)

	http.Handle("/workspace/", Log(wsContainer))
	http.Handle("/wsworkspace", Log(websocket.Handler(WorkspaceHandler(&w))))
	return nil
}

func transformEvent(ws *workspace, evt *fsnotify.FileEvent) (*fileevent, error) {
	var fe fileevent
	log.Printf("fsevent: %+v", evt)
	fe.Name = evt.Name[len(ws.Path):]
	fe.Created = evt.IsCreate()
	fe.Deleted = evt.IsDelete()
	fe.Modified = evt.IsModify()
	fe.Renamed = evt.IsRename()
	if fe.Deleted || fe.Renamed {
		return &fe, nil
	}
	fi, err := os.Lstat(evt.Name)
	if err != nil {
		return nil, err
	}
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
