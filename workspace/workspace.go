package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"github.com/emicklei/go-restful"
	"github.com/howeyc/fsnotify"
	"github.com/ulrichSchreiner/carpo/golang"
	"go/format"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	BUILD_GOLANG = "golang"
)

func (w *workspace) Register(container *restful.Container) {
	var ws restful.WebService
	ws.
		Path("/workspace").
		Consumes(restful.MIME_JSON).
		Produces(restful.MIME_JSON)
	//ws.Route(ws.GET("/dir?path={path}").To(w.dir).Writes(Dir{}))
	ws.Route(ws.GET("/dir").To(w.dir).Writes(Dir{}))
	ws.Route(ws.GET("/mkdir").To(w.createdir).Writes(Dir{}))
	ws.Route(ws.GET("/touch").To(w.touch).Writes(Dir{}))
	ws.Route(ws.GET("/rm").To(w.rmfile).Writes(Dir{}))
	ws.Route(ws.GET("/file").To(w.file).Writes(FileContent{}))
	ws.Route(ws.POST("/save").To(w.save).Reads(FileSaveRequest{}).Writes(FileSaveResponse{}))
	ws.Route(ws.POST("/saveConfig").To(w.saveConfig))
	ws.Route(ws.GET("/loadConfig").To(w.loadConfig))
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
	Ok               bool   `json:"ok"`
	Message          string `json:"message"`
	BuildResult      string `json:"buildresult"`
	BuildType        string `json:"buildtype"`
	FormattedContent string `json:"formattedcontent"`
}

type WorkspaceConfiguration struct {
	BaseDirectory string `json:"basedirectory"`
}

/*
 * Return the absolute part, relative part and an error.
 */
func (serv *workspace) getPathFromRequest(cpath string) (string, string, error) {
	path := filepath.Join(serv.Path, "./"+cpath)
	rpath, err := filepath.Rel(serv.Path, path)
	if err != nil {
		return "", "", err
	}
	return filepath.Join(serv.Path, rpath), rpath, nil
}
func (serv *workspace) save(request *restful.Request, response *restful.Response) {
	rq := new(FileSaveRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	path, _, err := serv.getPathFromRequest(rq.Path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	src, err := format.Source([]byte(rq.Content))
	if err != nil {
		src = []byte(rq.Content)
	}

	err = ioutil.WriteFile(path, src, os.FileMode(rq.Mode))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error saving file '%s': %s", path, err))
		return
	}
	fn := filepath.Base(path)
	fp := filepath.Dir(path)
	golang.Parse(string(src), fn)
	fres := FileSaveResponse{true, "File saved", "", "", string(src)}
	if rq.Build {
		if strings.HasSuffix(strings.ToLower(fn), ".go") {
			if serv.gotool != nil {
				fres.BuildType = BUILD_GOLANG
				cmd := exec.Command(*serv.gotool, "build")
				cmd.Dir = fp
				res, _ := cmd.CombinedOutput()
				fres.BuildResult = string(res)
			} else {
				fres.BuildResult = fmt.Sprintf("<error no 'go' tool available in path")
			}
		} else {
			fres.BuildResult = "<no go file saved>"
		}
	}
	response.WriteEntity(fres)
}
func (serv *workspace) file(request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(request.QueryParameter("path"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	var result FileContent
	result.Title = filepath.Base(path)
	f, err := os.Open(path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot open content of '%s' parameter: %s", rpath, err))
	} else {
		defer f.Close()
		cnt, err := ioutil.ReadAll(f)
		if err != nil {
			sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot read content of '%s' parameter: %s", rpath, err))
		}
		fi, err := f.Stat()
		if err != nil {
			sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot stat file '%s': %s", rpath, err))
		}
		result.Content = string(cnt)
		result.FileMode = uint32(fi.Mode())
		response.WriteEntity(&result)
	}
}

func (serv *workspace) dir(request *restful.Request, response *restful.Response) {
	serv.dircontent(request.QueryParameter("path"), request, response)
}

func (serv *workspace) dircontent(pt string, request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(pt)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}

	var result Dir
	result.Path = rpath
	if len(rpath) > 0 {
		result.PathEntries = strings.Split(rpath, string(os.PathSeparator))
	} else {
		result.PathEntries = []string{}
	}
	f, err := os.Open(path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot read '%s' parameter: %s", rpath, err))
	} else {
		defer f.Close()
		flz, err := f.Readdir(-1)
		if err != nil {
			sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot read contents of '%s': %s", rpath, err))
		} else {
			for _, fl := range flz {
				result.Entries = append(result.Entries, DirEntry{fl.Name(), fl.IsDir()})
			}
			response.WriteEntity(&result)
		}
	}
}
func (serv *workspace) rmfile(request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(request.QueryParameter("path"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	err = os.Remove(path)

	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot rm dir: %s", err))
		return
	}
	serv.dircontent(filepath.Join("/", rpath, ".."), request, response)
}

func (serv *workspace) createdir(request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(request.QueryParameter("path"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	err = os.Mkdir(path, 0755)

	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot create dir: %s", err))
		return
	}
	serv.dircontent(filepath.Join("/", rpath), request, response)
}
func (serv *workspace) touch(request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(request.QueryParameter("path"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	f, err := os.Create(path)
	defer f.Close()

	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot create file: %s", err))
		return
	}
	serv.dircontent(filepath.Join("/", rpath, ".."), request, response)
}

func (serv *workspace) saveConfig(request *restful.Request, response *restful.Response) {
	/*rq := new(WorkspaceConfiguration)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	*/
	f, err := os.Create(filepath.Join(serv.Path, ".carpo"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error create config: %s", err))
		return
	}
	defer f.Close()

	io.Copy(f, request.Request.Body)
	defer request.Request.Body.Close()
	//enc := json.NewEncoder(f)
	//enc.Encode(rq)
}

func (serv *workspace) loadConfig(request *restful.Request, response *restful.Response) {
	f, err := os.Open(filepath.Join(serv.Path, ".carpo"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error opening config: %s", err))
		return
	}
	defer f.Close()
	io.Copy(response, f)
	/*
		var conf WorkspaceConfiguration
		enc := json.NewDecoder(f)

		if err = enc.Decode(&conf); err != nil {
			sendError(response, http.StatusBadRequest, fmt.Errorf("Error reading config: %s", err))
			return
		}
		response.WriteEntity(conf)
	*/
}

func sendError(response *restful.Response, status int, err error) {
	response.WriteHeader(status)
	response.WriteEntity(restful.NewError(status, fmt.Sprintf("%s", err)))
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
	if !filepath.IsAbs(path) {
		workdir, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("cannot get current workingdir: %s", err)
		}

		path = filepath.Join(workdir, path)
	}
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
