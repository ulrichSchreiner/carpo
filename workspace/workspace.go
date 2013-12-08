package workspace

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"github.com/emicklei/go-restful"
	"github.com/howeyc/fsnotify"
	_ "github.com/ulrichSchreiner/carpo/golang"
	"github.com/ulrichSchreiner/carpo/workspace/builder"
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

type buildType string

const (
	BUILD_GOLANG             = "golang"
	TYPE_GO        buildType = "go"
	TYPE_APPENGINE buildType = "appengine"
)

func (w *workspace) register(container *restful.Container) {
	var ws restful.WebService
	ws.
		Path("/workspace").
		Consumes(restful.MIME_JSON).
		Produces(restful.MIME_JSON)
	ws.Route(ws.GET("/dir").To(w.dir).Writes(dir{}))
	ws.Route(ws.GET("/mkdir").To(w.createdir).Writes(dir{}))
	ws.Route(ws.GET("/touch").To(w.touch).Writes(dir{}))
	ws.Route(ws.GET("/rm").To(w.rmfile).Writes(dir{}))
	ws.Route(ws.GET("/file").To(w.file).Writes(fileContent{}))
	ws.Route(ws.POST("/file").To(w.save).Reads(fileSaveRequest{}).Writes(fileSaveResponse{}))
	ws.Route(ws.POST("/config").To(w.saveConfig))
	ws.Route(ws.GET("/config").To(w.loadConfig))
	ws.Route(ws.POST("/build").To(w.buildWorkspace).Reads(buildRequest{}).Writes(buildResponse{}))
	container.Add(&ws)
}

type dirEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"dir"`
}

type dir struct {
	Path        string     `json:"path"`
	PathEntries []string   `json:"pathentries"`
	Entries     []dirEntry `json:"entries"`
}

type fileContent struct {
	Content  string `json:"content"`
	Title    string `json:"title"`
	MimeType string `json:"mimetype"`
	FileMode uint32 `json:"filemode"`
}

type buildRequest struct {
	Build   bool      `json:"build"`
	Builder string    `json:"builder"`
	Type    buildType `json:"buildtype"`
}

type fileSaveRequest struct {
	buildRequest
	Path    string `json:"path"`
	Content string `json:"content"`
	Mode    uint32 `json:"mode"`
}
type buildResponse struct {
	Ok               bool                  `json:"ok"`
	Message          string                `json:"message"`
	BuildType        string                `json:"buildtype"`
	BuiltDirectories []string              `json:"builtDirectories"`
	BuildOutput      []builder.BuildResult `json:"buildoutput"`
}
type fileSaveResponse struct {
	buildResponse
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
	rq := new(fileSaveRequest)
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
	//golang.Parse(string(src), fn)
	fres := fileSaveResponse{buildResponse{true, "File saved", "", []string{}, []builder.BuildResult{}}, string(src)}
	if rq.Build {
		if strings.HasSuffix(strings.ToLower(fn), ".go") {
			builder := serv.findBuilder(rq.Type, rq.Builder)
			if builder != nil {
				fres.BuildType = BUILD_GOLANG
				output, dirs, err := serv.goworkspace.BuildPackage(serv.Path, *builder, fp)
				if err != nil {
					log.Printf("ERROR: %s\n", err)
					fres.Message = err.Error()
					fres.Ok = false
				} else {
					fres.BuildOutput = *output
					fres.BuiltDirectories = *dirs
				}
			}
		}
	}
	response.WriteEntity(fres)
}
func (serv *workspace) findBuilder(tp buildType, userpath string) *string {
	if len(userpath) > 0 {
		return &userpath
	}
	switch tp {
	case TYPE_GO:
		return serv.gotool
	case TYPE_APPENGINE:
		return serv.goapptool
	}
	return nil
}

func (serv *workspace) file(request *restful.Request, response *restful.Response) {
	path, rpath, err := serv.getPathFromRequest(request.QueryParameter("path"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Path: %s", err))
		return
	}
	var result fileContent
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

	var result dir
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
				result.Entries = append(result.Entries, dirEntry{fl.Name(), fl.IsDir()})
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
	f, err := os.Create(filepath.Join(serv.Path, ".carpo.json"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error create config: %s", err))
		return
	}
	defer f.Close()

	io.Copy(f, request.Request.Body)
	defer request.Request.Body.Close()
}

func (serv *workspace) loadConfig(request *restful.Request, response *restful.Response) {
	f, err := os.Open(filepath.Join(serv.Path, ".carpo.json"))
	if err != nil {
		//sendError(response, http.StatusBadRequest, fmt.Errorf("Error opening config: %s", err))
		response.Write([]byte("{}"))
		return
	}
	defer f.Close()
	io.Copy(response, f)
}

func (serv *workspace) buildWorkspace(request *restful.Request, response *restful.Response) {
	result := buildResponse{true, "Full Build", "", []string{}, []builder.BuildResult{}}
	rq := new(buildRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Build Request: %s", err))
		return
	}
	builder := serv.findBuilder(rq.Type, rq.Builder)
	if builder != nil {
		result.BuildType = BUILD_GOLANG
		output, dirs, err := serv.goworkspace.FullBuild(serv.Path, *builder)
		if err != nil {
			log.Printf("Build ERROR: %s\n", err)
			result.Message = err.Error()
			result.Ok = false
		} else {
			result.BuildOutput = *output
			result.BuiltDirectories = *dirs
		}
	} else {
		result.Message = fmt.Sprintf("No Builder found for Apptype: %s", rq.Type)
		result.Ok = false
	}

	response.WriteEntity(&result)
}

func sendError(response *restful.Response, status int, err error) {
	response.WriteHeader(status)
	response.WriteEntity(restful.NewError(status, fmt.Sprintf("%s", err)))
}

type workspace struct {
	Path        string
	Watcher     *fsnotify.Watcher
	gotool      *string
	goapptool   *string
	goworkspace *builder.GoWorkspace
}

type fileevent struct {
	Name     string
	IsDir    bool
	Created  bool
	Deleted  bool
	Modified bool
	Renamed  bool
}

func logged(handler http.Handler) http.Handler {
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
	gws := builder.Scan([]string{path})
	w := workspace{path, nil, nil, nil, gws}

	gopath, err := exec.LookPath("go")
	if err != nil {
		log.Printf("no go tool found in path: %s\n", err)
	} else {
		w.gotool = &gopath
		log.Printf("go: %s", *w.gotool)
	}
	goapppath, err := exec.LookPath("goapp")
	if err != nil {
		log.Printf("no goapp tool found in path: %s\n", err)
	} else {
		w.goapptool = &goapppath
		log.Printf("goapp: %s", *w.goapptool)
	}

	wsContainer := restful.NewContainer()
	w.register(wsContainer)

	http.Handle("/workspace/", logged(wsContainer))
	//http.Handle("/wsworkspace", logged(websocket.Handler(workspaceHandler(&w))))
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
func workspaceHandler(works *workspace) websocket.Handler {
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
