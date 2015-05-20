package workspace

import (
	"fmt"
	"github.com/emicklei/go-restful"
	"net/http"
	"path/filepath"
)

const (
	cmdline_main = `package main
	
import (
  "fmt"
  "flag"
)

var species = flag.String("species", "gopher", "the species we are studying")

func main () {
  flag.Parse()
  fmt.Printf ("You specified %s\n", *species)
}`

	simplewebapp = `package main

import (
    "fmt"
    "flag"
    "net/http"
)

var address = flag.String("address", ":8080", "bind address of server")

func handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hi there, I love %s!", r.URL.Path[1:])
}

func main() {
    http.HandleFunc("/", handler)
    http.ListenAndServe(*address, nil)
}`
)

var templates map[string]string

func init() {
	templates = make(map[string]string)
	templates["cmdline"] = cmdline_main
	templates["simplewebapp"] = simplewebapp
}

type servertemplate struct {
	Name       string `json:"name"`
	ImportPath string `json:"importpath"`
	Template   string `json:"template"`
}
type servertemplate_result struct {
	Path       string `json:"path"`
	Filesystem string `json:"filesystem"`
}

func (serv *workspace) createtemplate(rq *servertemplate, template string) (*servertemplate_result, error) {
	path := filepath.Join("src", rq.ImportPath, rq.Name)
	err := serv.goworkspace.DefaultFS.Mkdir(path, 0755)
	if err != nil {
		return nil, fmt.Errorf("Error creating directory %s: %s", path, err)
	}
	maingo := filepath.Join(path, "main.go")
	fl, err := serv.goworkspace.DefaultFS.Create(maingo)
	if err != nil {
		return nil, fmt.Errorf("Error creating main.go: %s", err)
	}
	fl.Write([]byte(template))
	fl.Close()
	serv.goworkspace.BuildPackage(serv.goworkspace.DefaultFS, rq.ImportPath, false, false)
	var res servertemplate_result
	res.Filesystem = serv.goworkspace.DefaultFS.Name()
	res.Path = fmt.Sprintf("/%s", maingo)
	return &res, nil
}

func (serv *workspace) template(request *restful.Request, response *restful.Response) {
	rq := new(servertemplate)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error reading request: %s", err))
		return
	}
	tr, err := serv.createtemplate(rq, templates[rq.Template])
	if err != nil {
		sendError(response, http.StatusBadRequest, err)
		return
	}
	response.WriteEntity(*tr)
}
