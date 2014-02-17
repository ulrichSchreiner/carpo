package workspace

import (
	"bytes"
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/emicklei/go-restful"
	// "github.com/howeyc/fsnotify"
	"github.com/ulrichSchreiner/carpo/workspace/builder"
	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
	"github.com/ulrichSchreiner/gdbmi"
	"go/format"
	"io"
	"io/ioutil"
	"launchpad.net/loggo"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type buildType string

var workspaceLogger = loggo.GetLogger("workspace")

const (
	BUILD_GOLANG             = "golang"
	APPTYPE                  = "apptype"
	TYPE_GO        buildType = "go"
	TYPE_APPENGINE buildType = "appengine"

	SETTING_GOPATH    = "go_path"
	SETTING_GOAPPPATH = "goapp_path"
)

func (w *workspace) register(container *restful.Container) {
	var ws restful.WebService
	ws.
		Path("/workspace").
		Consumes(restful.MIME_JSON).
		Produces(restful.MIME_JSON)
	ws.Route(ws.GET("/reset").To(w.reset))
	ws.Route(ws.POST("/dir").To(w.dir).Reads(dirRequest{}).Writes(dir{}))
	ws.Route(ws.POST("/mkdir").To(w.createdir).Reads(dirRequest{}).Writes(dir{}))
	ws.Route(ws.POST("/touch").To(w.touch).Reads(fileReadRequest{}).Writes(dir{}))
	ws.Route(ws.POST("/rm").To(w.rmfile).Reads(dirRequest{}).Writes(dir{}))
	ws.Route(ws.POST("/readfile").To(w.file).Reads(fileReadRequest{}).Writes(fileContent{}))
	ws.Route(ws.POST("/savefile").To(w.save).Reads(fileSaveRequest{}).Writes(fileSaveResponse{}))
	ws.Route(ws.POST("/config").To(w.saveConfig))
	ws.Route(ws.GET("/config").To(w.loadConfig))
	ws.Route(ws.GET("/environment").To(w.loadEnvironment))
	ws.Route(ws.GET("/install/gocode").To(w.installGocode))
	ws.Route(ws.GET("/install/package").To(w.installPackage))
	ws.Route(ws.POST("/build").To(w.buildWorkspace).Reads(buildRequest{}).Writes(buildResponse{}))
	ws.Route(ws.POST("/autocomplete").To(w.autocomplete).Reads(autocomplete{}).Writes(autocompleteResult{}))
	ws.Route(ws.POST("/parseSource").To(w.parseSource).Reads(parsesource{}).Writes(parsesourceResult{}))
	ws.Route(ws.GET("/querypackages").To(w.querypackages).Writes(query_packages{}))
	ws.Route(ws.GET("/queryremotepackages").To(w.queryremotepackages).Writes(query_packages{}))
	ws.Route(ws.GET("/process/{pid}/kill").To(w.killproc))
	ws.Route(ws.GET("/exit").To(w.exitCarpo))
	ws.Route(ws.POST("/wizard/template").To(w.template).Reads(servertemplate{}).Writes(servertemplate_result{}))
	container.Add(&ws)
}

type (
	autocomplete struct {
		Content string `json:"content"`
		Path    string `json:"path"`
		Column  int    `json:"column"`
		Row     int    `json:"row"`
	}

	autocompleteResult struct {
		Suggestions []builder.Suggestion `json:"suggestions"`
	}
)

type (
	parsesource struct {
		Content    string  `json:"content"`
		Filesystem *string `json:"filesystem"`
		Path       string  `json:"path"`
	}
	parsesourceResult struct {
		Tokens []builder.TokenPosition `json:"tokens"`
	}
)

type (
	query_package struct {
		Name  string `json:"name"`
		Descr string `json:"description"`
	}
	query_packages struct {
		Query    string          `json:"query"`
		Packages []query_package `json:"packages"`
	}
)
type (
	gocodeenv struct {
		Path *string `json:"path"`
	}
)

type (
	dirEntry struct {
		Filesystem string `json:"filesystem"`
		Name       string `json:"name"`
		IsDir      bool   `json:"dir"`
	}

	dir struct {
		Filesystem string     `json:"filesystem"`
		Path       string     `json:"path"`
		Entries    []dirEntry `json:"entries"`
	}

	dirRequest struct {
		Filesystem string `json:"filesystem"`
		Path       string `json:"path"`
	}
)

type fileContent struct {
	Content  string `json:"content"`
	Title    string `json:"title"`
	MimeType string `json:"mimetype"`
	FileMode uint32 `json:"filemode"`
}

type buildRequest struct {
	Build bool      `json:"build"`
	Type  buildType `json:"buildtype"`
}

type fileReadRequest struct {
	Filesystem string `json:"filesystem"`
	Path       string `json:"path"`
}

type fileSaveRequest struct {
	buildRequest
	Filesystem string `json:"filesystem"`
	Path       string `json:"path"`
	Content    string `json:"content"`
	Mode       uint32 `json:"mode"`
}
type buildResponse struct {
	Ok          bool                  `json:"ok"`
	Message     string                `json:"message"`
	BuildType   string                `json:"buildtype"`
	BuildOutput []builder.BuildResult `json:"buildoutput"`
}
type fileSaveResponse struct {
	buildResponse
	FormattedContent string             `json:"formattedcontent"`
	Parsed           *parsesourceResult `json:"parsed"`
}

type WorkspaceConfiguration struct {
	BaseDirectory string `json:"basedirectory"`
}

func (serv *workspace) fs(name string) (filesystem.WorkspaceFS, error) {
	fs, ok := serv.filesystems[name]
	if !ok {
		return nil, fmt.Errorf("unknown filesystem %s", name)
	}
	return fs, nil
}

func (serv *workspace) save(request *restful.Request, response *restful.Response) {
	rq := new(fileSaveRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}
	path, rpath, fl, err := filesystem.AbsolutePathWrite(fs, rq.Path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal path %s in fs %s: %v", rq.Path, fs.Base(), err))
		return
	}
	defer fl.Close()
	src, err := format.Source([]byte(rq.Content))
	if err != nil {
		src = []byte(rq.Content)
	}
	_, err = fl.Write(src)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error saving file: %v", err))
		return
	}
	//fn := filepath.Base(path)
	fp := filepath.Dir(path)
	//golang.Parse(string(src), fn)
	fres := fileSaveResponse{buildResponse{true, "File saved", "", []builder.BuildResult{}}, string(src), nil}
	if rq.Build {
		if strings.HasSuffix(strings.ToLower(rpath), ".go") {
			fres.BuildType = BUILD_GOLANG
			output, _, err := serv.goworkspace.BuildPackage(fs, fp)
			if err != nil {
				workspaceLogger.Errorf("%s", err)
				fres.Message = err.Error()
				fres.Ok = false
			} else {
				fres.BuildOutput = *output
			}
			//toks, err := builder.ParseSource(string(src))
			toks, err := builder.ParsePath(fs, rq.Path)
			if err == nil {
				fres.Parsed = &parsesourceResult{Tokens: toks}
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
	rq := new(fileReadRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}
	_, rpath, fl, err := filesystem.AbsolutePath(fs, rq.Path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal path %s in fs %s: %v", rq.Path, fs.Base(), err))
		return
	}
	defer fl.Close()

	var result fileContent
	result.Title = filepath.Base(rpath)
	cnt, err := ioutil.ReadAll(fl)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot read content of '%s' parameter: %s", rq.Path, err))
	}
	fi, err := fs.Stat(rpath)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot stat file '%s': %s", rq.Path, err))
	}
	result.Content = string(cnt)
	result.FileMode = uint32(fi.Mode())
	response.WriteEntity(&result)
}

func (serv *workspace) dir(request *restful.Request, response *restful.Response) {
	rq := new(dirRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	if len(rq.Filesystem) == 0 {
		var result dir
		for _, n := range serv.goworkspace.RootFS() {
			result.Entries = append(result.Entries, dirEntry{n, n, true})
		}
		response.WriteEntity(&result)
		return
	}

	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}
	_, rpath, fl, err := filesystem.AbsolutePath(fs, rq.Path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal path %s in fs %s: %v", rq.Path, fs.Base(), err))
		return
	}
	defer fl.Close()
	serv.dircontent(fs, fl, rpath, request, response)
}

func (serv *workspace) dircontent(fs filesystem.WorkspaceFS, fl filesystem.WorkspaceFile, path string, request *restful.Request, response *restful.Response) {
	var result dir
	flz, err := fl.Readdir(-1)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot read contents of '%s': %s", path, err))
	} else {
		for _, fli := range flz {
			result.Entries = append(result.Entries, dirEntry{fs.Name(), fli.Name(), fli.IsDir()})
		}
		response.WriteEntity(&result)
	}
}
func (serv *workspace) rmfile(request *restful.Request, response *restful.Response) {
	rq := new(dirRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}

	path := filepath.Clean(rq.Path)
	err = fs.RemoveAll(path)

	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot rm dir: %s", err))
		return
	}
	fl, err := fs.Open(filepath.Dir(path), os.O_RDONLY, 0666)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("cannot open parent dir: %v", err))
		return
	}
	defer fl.Close()
	serv.dircontent(fs, fl, filepath.Dir(path), request, response)
}

func (serv *workspace) createdir(request *restful.Request, response *restful.Response) {
	rq := new(dirRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}
	err = fs.Mkdir(rq.Path, 0755)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot create dir: %s", err))
		return
	}
	fl, err := fs.Open(rq.Path, os.O_RDONLY, 0666)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot open created dir: %s", err))
		return
	}
	defer fl.Close()
	serv.dircontent(fs, fl, rq.Path, request, response)
}
func (serv *workspace) touch(request *restful.Request, response *restful.Response) {
	rq := new(fileReadRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Request: %s", err))
		return
	}
	fs, ok := serv.filesystems[rq.Filesystem]
	if !ok {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Unknown filesystem: %s", rq.Filesystem))
		return
	}
	f, err := fs.Create(rq.Path)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Cannot create file: %s", err))
		return
	}
	f.Close()
	fl, err := fs.Open(filepath.Dir(rq.Path), os.O_RDONLY, 0666)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("cannot open parent dir: %v", err))
		return
	}
	defer fl.Close()
	serv.dircontent(fs, fl, filepath.Dir(rq.Path), request, response)
}

func (serv *workspace) saveConfig(request *restful.Request, response *restful.Response) {
	f, err := os.Create(filepath.Join(serv.Path, ".carpo.json"))
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error create config: %s", err))
		return
	}
	defer f.Close()
	defer request.Request.Body.Close()

	var conf interface{}
	err = json.NewDecoder(request.Request.Body).Decode(&conf)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error parsing config: %s", err))
		return
	}
	oldgo := serv.gobinpath()
	serv.config = conf.(map[string]interface{})
	newgo := serv.gobinpath()
	if bytes.Compare([]byte(*oldgo), []byte(*newgo)) != 0 {
		gws := builder.NewGoWorkspace(*newgo, serv.Path, serv.gocode, serv.filesystems)
		serv.goworkspace.Shutdown()
		serv.goworkspace = gws
	}
	b, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error writing config: %s", err))
		return
	}
	f.Write(b)
	//json.NewEncoder(f).Encode(conf)
}

func (serv *workspace) loadConfig(request *restful.Request, response *restful.Response) {
	serv.config["carpoversion"] = serv.Version
	json.NewEncoder(response).Encode(serv.config)
}

func (serv *workspace) reset(request *restful.Request, response *restful.Response) {
	workspaceLogger.Infof("Reset workspace")
	for pid, _ := range serv.processes {
		serv.killProcess(pid)
	}
	for _, s := range serv.debugSession {
		go s.Gdb_exit()
	}
}

func (serv *workspace) loadEnvironment(request *restful.Request, response *restful.Response) {
	res := make(map[string]interface{})

	var gocodesettings gocodeenv

	gocodesettings.Path = serv.gocode
	//gocodesettings.Path = nil
	res["gocode"] = gocodesettings
	response.WriteEntity(res)
}

func (serv *workspace) installPackage(request *restful.Request, response *restful.Response) {
	pkg := request.QueryParameter("pkg")
	err := serv.goworkspace.InstallPackage(pkg, serv.plugindir)
	if err != nil {
		sendError(response, http.StatusInternalServerError, err)
	} else {
		serv.loadEnvironment(request, response)
	}
}
func (serv *workspace) installGocode(request *restful.Request, response *restful.Response) {
	gocode, err := serv.goworkspace.InstallGocode(serv.plugindir)
	if err != nil {
		sendError(response, http.StatusInternalServerError, err)
		return
	} else {
		serv.gocode = gocode
	}
	serv.loadEnvironment(request, response)
}

func (serv *workspace) loadConfiguration() {
	f, err := os.Open(filepath.Join(serv.Path, ".carpo.json"))
	serv.config = make(map[string]interface{})
	if err == nil {
		defer f.Close()
		err = json.NewDecoder(f).Decode(&serv.config)
		if err != nil {
			workspaceLogger.Warningf("Cannot decode .carpo.json: %s", err)
		} else {
			_, ok := serv.config["name"]
			if !ok {
				serv.config["name"] = filepath.Base(serv.Path)
			}
		}
	} else {
		serv.config["name"] = serv.Path
	}
}

func (serv *workspace) buildWorkspace(request *restful.Request, response *restful.Response) {
	result := buildResponse{true, "Full Build", "", []builder.BuildResult{}}
	rq := new(buildRequest)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Illegal Build Request: %s", err))
		return
	}
	ignoredPackages := make(map[string]bool)
	if ignored, ok := serv.config["ignoredPackages"]; ok {
		for k, _ := range ignored.(map[string]interface{}) {
			ignoredPackages[k] = true
		}
	}
	result.BuildType = BUILD_GOLANG
	workspace := serv.goworkspace.WorkspaceFS()
	output, _, err := serv.goworkspace.FullBuild(workspace, ignoredPackages)
	if err != nil {
		workspaceLogger.Errorf("Build error: %s", err)
		result.Message = err.Error()
		result.Ok = false
	} else {
		result.BuildOutput = *output
	}

	response.WriteEntity(&result)
}

func (serv *workspace) get_build_type() (apptype buildType, go_settings map[string]interface{}, resok bool) {
	if wssettings, ok := serv.config["settings"]; ok {
		settings := wssettings.(map[string]interface{})
		if val, ok := settings["go"]; ok {
			go_settings = val.(map[string]interface{})
			apptype_s := go_settings[APPTYPE].(string)
			apptype = buildType(apptype_s)
			resok = true
			return
		}
	}
	return
}

func (serv *workspace) gobinpath() *string {
	if apptype, go_settings, ok := serv.get_build_type(); ok {
		switch apptype {
		case TYPE_GO:
			gopath, _ := go_settings[SETTING_GOPATH]
			if gopath != nil {
				gp := gopath.(string)
				return &gp
			} else {
				return serv.gotool
			}
		case TYPE_APPENGINE:
			gopath, _ := go_settings[SETTING_GOAPPPATH]
			if gopath != nil {
				gp := gopath.(string)
				return &gp
			} else {
				return serv.goapptool
			}
		}
	}
	return serv.gotool
}

func (serv *workspace) killproc(request *restful.Request, response *restful.Response) {
	spid := request.PathParameter("pid")
	pid, err := strconv.ParseInt(spid, 10, 0)
	if err == nil {
		serv.killProcess(int(pid))
	}
}
func (serv *workspace) putProcess(p *os.Process) int {
	serv.proclock.Lock()
	defer serv.proclock.Unlock()
	serv.processes[p.Pid] = p
	return p.Pid
}

func (serv *workspace) removeProcess(p *os.Process) {
	serv.proclock.Lock()
	defer serv.proclock.Unlock()
	delete(serv.processes, p.Pid)
}
func (serv *workspace) killProcess(pid int) {
	serv.proclock.Lock()
	defer serv.proclock.Unlock()
	// only kill, if the pid is in our process-map!
	p, ok := serv.processes[pid]
	if ok {
		p.Kill()
		delete(serv.processes, p.Pid)
	}
}

func (serv *workspace) exitCarpo(request *restful.Request, response *restful.Response) {
	os.Exit(0)
}

func (serv *workspace) querypackages(request *restful.Request, response *restful.Response) {
	var result query_packages
	local := serv.goworkspace.QueryPackages()
	for _, p := range local.Results {
		result.Packages = append(result.Packages, query_package{Name: p.Path, Descr: p.Synopsis})
	}
	response.WriteEntity(result)
}
func (serv *workspace) queryremotepackages(request *restful.Request, response *restful.Response) {
	var result query_packages
	q := request.QueryParameter("q")
	result.Query = q
	remote := serv.goworkspace.QueryRemotePackages(q)
	for _, p := range remote.Results {
		result.Packages = append(result.Packages, query_package{Name: p.Path, Descr: p.Synopsis})
	}
	response.WriteEntity(result)
}

func (serv *workspace) parseSource(request *restful.Request, response *restful.Response) {
	rq := new(parsesource)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error reading parsesource content: %s", err))
		return
	}
	var res []builder.TokenPosition
	if rq.Filesystem != nil && *(rq.Filesystem) != "" {
		fs, err := serv.fs(*rq.Filesystem)
		if err != nil {
			sendError(response, http.StatusBadRequest, fmt.Errorf("Error interpreting filesystem: %s", err))
			return
		}
		res, err = builder.ParsePath(fs, rq.Path)
	} else {
		res, err = builder.ParseSource(rq.Content)
	}
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error parsing source content: %s", err))
		return
	}
	response.WriteEntity(parsesourceResult{res})
}

func (serv *workspace) autocomplete(request *restful.Request, response *restful.Response) {
	if serv.gocode == nil {
		sendError(response, http.StatusBadRequest, errors.New("No gocode found in system"))
		return
	}
	rq := new(autocomplete)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error reading autocomplete request: %s", err))
		return
	}
	rsp := new(autocompleteResult)
	pos := rq.Column
	if rq.Row > 0 {
		pos = findPosition(rq.Content+"\n", rq.Row, rq.Column)
	}
	isappengine := false
	if appt, _, ok := serv.get_build_type(); ok {
		switch appt {
		case TYPE_APPENGINE:
			isappengine = true
		}
	}

	suggestions, err := serv.goworkspace.Autocomplete(serv.gocode, rq.Content, filepath.Join(serv.Path, rq.Path), pos, rq.Row, rq.Column, isappengine)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error calculating suggestions: %s", err))
		return
	}
	rsp.Suggestions = suggestions
	response.WriteEntity(rsp)
}

func findPosition(content string, row int, col int) (abslen int) {
	buf := bytes.NewBufferString(content)
	for i := 0; i < row; i++ {
		line, _ := buf.ReadString('\n')
		abslen += len(line)
	}
	abslen += col
	return
}

func sendError(response *restful.Response, status int, err error) {
	response.WriteHeader(status)
	response.WriteEntity(restful.NewError(status, fmt.Sprintf("%s", err)))
}

type workspace struct {
	Version   string
	Path      string
	plugindir string
	//Watcher     *fsnotify.Watcher
	gotool      *string
	goapptool   *string
	gocode      *string
	goworkspace *builder.GoWorkspace
	config      map[string]interface{}

	processes    map[int]*os.Process
	debugSession map[int]*gdbmi.GDB
	proclock     *sync.Mutex
	filesystems  map[string]filesystem.WorkspaceFS
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
		workspaceLogger.Infof("%s %s %s", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func NewWorkspace(path string, version string) error {
	if !filepath.IsAbs(path) {
		workdir, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("cannot get current workingdir: %s", err)
		}

		path = filepath.Join(workdir, path)
	}
	os.Mkdir(filepath.Join(path, "src"), 0755)
	os.Mkdir(filepath.Join(path, "pkg"), 0755)
	os.Mkdir(filepath.Join(path, "bin"), 0755)
	plugindir := filepath.Join(path, ".carpoplugins")
	err := os.Mkdir(plugindir, 0755)
	if err != nil && !os.IsExist(err) {
		workspaceLogger.Criticalf("cannot create subdirectory '.carpoplugins': %s", err)
	} else {
		os.Mkdir(filepath.Join(plugindir, "src"), 0755)
		os.Mkdir(filepath.Join(plugindir, "pkg"), 0755)
		os.Mkdir(filepath.Join(plugindir, "bin"), 0755)
	}

	w := workspace{version, path, plugindir, nil, nil, nil, nil, nil, nil, nil, new(sync.Mutex), make(map[string]filesystem.WorkspaceFS)}
	w.loadConfiguration()
	w.processes = make(map[int]*os.Process)
	w.debugSession = make(map[int]*gdbmi.GDB)

	gopath, err := exec.LookPath("go")
	if err != nil {
		workspaceLogger.Infof("no go tool found in path: %s", err)
	} else {
		w.gotool = &gopath
		workspaceLogger.Infof("go: %s", *w.gotool)
	}
	goapppath, err := exec.LookPath("goapp")
	if err != nil {
		workspaceLogger.Infof("no goapp tool found in path: %s", err)
	} else {
		w.goapptool = &goapppath
		workspaceLogger.Infof("goapp: %s", *w.goapptool)
	}
	gobinpath := w.gobinpath()
	if gobinpath != nil {
		workspaceLogger.Infof("Workspace uses %s as go", *gobinpath)
	} else {
		if gopath != "" {
			gobinpath = &gopath
		} else {
			return errors.New("Workspace uses nothing as go, no 'goapp' or 'go' als failover found")
		}
	}
	gocode, err := findInPluginsOrEnvironment(plugindir, "gocode")
	if err != nil {
		workspaceLogger.Infof("no gocode found in path: %s", err)
	} else {
		w.gocode = gocode
		workspaceLogger.Infof("gocode: %s", *w.gocode)
	}

	gws := builder.NewGoWorkspace(*gobinpath, path, w.gocode, w.filesystems)
	w.goworkspace = gws

	wsContainer := restful.NewContainer()
	w.register(wsContainer)

	http.Handle("/workspace/", logged(wsContainer))
	http.Handle("/launch/", logged(websocket.Handler(launchProcessHandler(&w))))
	http.Handle("/debugconsole/", logged(websocket.Handler(debugConsoleHandler(&w))))
	http.Handle("/debug/", logged(websocket.Handler(debugProcessHandler(&w))))
	//http.Handle("/wsworkspace", logged(websocket.Handler(workspaceHandler(&w))))
	return nil
}

func findInPluginsOrEnvironment(plugindir string, toolname string) (toolpath *string, err error) {
	tool := filepath.Join(plugindir, "bin", toolname)
	if _, err := os.Stat(tool); err == nil {
		return &tool, nil
	}

	tool, err = exec.LookPath(toolname)
	if err != nil {
		return
	}
	return &tool, nil
}

/*
func transformEvent(ws *workspace, evt *fsnotify.FileEvent) (*fileevent, error) {
	var fe fileevent
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
*/
func launchProcessHandler(wks *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		location := ws.Config().Location.Path
		parts := strings.Split(location, "/")
		launchid := parts[len(parts)-1]
		lc, err := wks.getLaunchConfig(launchid)
		if err != nil {
			workspaceLogger.Errorf("Error in launchProcessHandler: %v", err)
		} else {
			cmd := wks.launch(lc)
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				workspaceLogger.Errorf("no StdoutPipe: %s", err)
				return
			}
			stderr, err := cmd.StderrPipe()
			if err != nil {
				workspaceLogger.Errorf("no StderrPipe: %s", err)
				return
			}
			stdin, err := cmd.StdinPipe()
			if err != nil {
				workspaceLogger.Errorf("no StdinPipe: %s", err)
				return
			}
			if err := cmd.Start(); err != nil {
				workspaceLogger.Errorf("when starting process: %s", err)
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
				workspaceLogger.Errorf("waiting for process: %s", err)
			}
			wks.removeProcess(cmd.Process)
			workspaceLogger.Infof("LC '%+v' ended", lc)
		}
	}
}

/*
func workspaceHandler(works *workspace) websocket.Handler {
	return func(ws *websocket.Conn) {
		watcher, err := fsnotify.NewWatcher()
		if err != nil {
			workspaceLogger.Errorf("Cannot create Watcher: %v", err)
			return
		}
		err = watcher.Watch(works.Path)
		workspaceLogger.Infof("Start watching %s ...", works.Path)
		if err != nil {
			workspaceLogger.Errorf("Cannot start Watcher: %v", err)
			return
		}
		works.Watcher = watcher
		for {
			select {
			case ev := <-watcher.Event:
				//fmt.Fprintln(ws, "event:", ev)
				fe, err := transformEvent(works, ev)
				if err != nil {
					workspaceLogger.Errorf("Error transforming event: %v", err)
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
*/
