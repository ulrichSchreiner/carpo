package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"github.com/emicklei/go-restful"
	"github.com/howeyc/fsnotify"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
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
	ws.Route(ws.GET("/file").To(w.file).Writes(FileContent{}))
	ws.Route(ws.POST("/save").To(w.save).Reads(FileSaveRequest{}).Writes(FileSaveResponse{}))
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

type FileContent struct {
	Content  string `json:"content"`
	Title    string `json:"title"`
	MimeType string `json:"mimetype"`
	FileMode uint32 `json:"filemode"`
}

type FileSaveRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Mode    uint32 `json:"mode"`
	Build   bool   `json:"build"`
}
type FileSaveResponse struct {
	Ok          bool   `json:"ok"`
	Message     string `json:"message"`
	BuildResult string `json:"buildresult"`
}

func (serv *workspace) getPathFromRequest(rq *restful.Request) (string, error) {
	cpath := rq.QueryParameter("path")
	path := filepath.Join(serv.Path, "./"+cpath)
	return path, nil
}
func (serv *workspace) save(request *restful.Request, response *restful.Response) {
	rq := new(FileSaveRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Illegal Path: %s", err)))
		return
	}
	path := filepath.Join(serv.Path, "./"+rq.Path)
	log.Printf("Save: %+v, path:%s", rq, path)
	err = ioutil.WriteFile(path, []byte(rq.Content), os.FileMode(rq.Mode))
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Error saving file '%s': %s", path, err)))
		return
	}
	buildresult := ""
	if rq.Build {
		fn := filepath.Base(path)
		fp := filepath.Dir(path)
		log.Printf("fn=%s, fp=%s\n", fn, fp)
		if strings.HasSuffix(strings.ToLower(fn), ".go") {
			log.Printf("it is go!")
			if serv.gotool != nil {
				cmd := exec.Command(*serv.gotool, "build")
				cmd.Dir = fp
				log.Printf("run: %+v", cmd)
				res, err := cmd.CombinedOutput()
				if err != nil {
					buildresult = string(res)
					//buildresult = fmt.Sprintf("<error running 'go build' in directory %s: %s ", fp, err)
				} else {
					buildresult = string(res)
				}
			} else {
				buildresult = fmt.Sprintf("<error no 'go' tool available in path")
			}
		} else {
			buildresult = "<no go file saved>"
		}
	}
	response.WriteEntity(FileSaveResponse{true, "File saved", buildresult})
	//f, err := os.Open(path, )
}
func (serv *workspace) file(request *restful.Request, response *restful.Response) {
	path, err := serv.getPathFromRequest(request)
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Illegal Path: %s", err)))
		return
	}
	var result FileContent
	result.Title = filepath.Base(path)
	f, err := os.Open(path)
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Cannot open content of '%s' parameter: %s", path, err)))
	} else {
		defer f.Close()
		cnt, err := ioutil.ReadAll(f)
		if err != nil {
			response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Cannot read content of '%s' parameter: %s", path, err)))
		}
		fi, err := f.Stat()
		if err != nil {
			response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Cannot stat file '%s': %s", path, err)))
		}
		result.Content = string(cnt)
		result.FileMode = uint32(fi.Mode())
		response.WriteEntity(&result)
	}
}

func (serv *workspace) dir(request *restful.Request, response *restful.Response) {
	cpath := request.QueryParameter("path")
	path, err := serv.getPathFromRequest(request)
	if err != nil {
		response.WriteEntity(restful.NewError(http.StatusBadRequest, fmt.Sprintf("Illegal Path: %s", err)))
		return
	}

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
		defer f.Close()
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
	gotool  *string
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
	w := workspace{path, nil, nil}
	gopath, err := exec.LookPath("go")
	if err != nil {
		log.Printf("no go tool found in path: %s\n", err)
	} else {
		w.gotool = &gopath
	}
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
