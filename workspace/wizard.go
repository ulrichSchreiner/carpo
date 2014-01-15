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
)

type wizard_commandline struct {
	Name       string `json:"name"`
	ImportPath string `json:"importpath"`
}
type wizard_result struct {
	Path       string `json:"path"`
	Filesystem string `json:"filesystem"`
}

func (serv *workspace) createCommandLineUtility(request *restful.Request, response *restful.Response) {
	rq := new(wizard_commandline)
	err := request.ReadEntity(&rq)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error reading wizard_commandline request: %s", err))
		return
	}
	path := filepath.Join("src", rq.ImportPath, rq.Name)
	err = serv.goworkspace.DefaultFS.Mkdir(path, 0755)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error creating directory %s: %s", path, err))
		return
	}
	maingo := filepath.Join(path, "main.go")
	fl, err := serv.goworkspace.DefaultFS.Create(maingo)
	if err != nil {
		sendError(response, http.StatusBadRequest, fmt.Errorf("Error creating main.go: %s", err))
		return
	}
	fl.Write([]byte(cmdline_main))
	fl.Close()
	serv.goworkspace.BuildPackage(serv.goworkspace.DefaultFS, rq.ImportPath)
	var res wizard_result
	res.Filesystem = serv.goworkspace.DefaultFS.Name()
	res.Path = fmt.Sprintf("/%s", maingo)
	response.WriteEntity(res)
}
