package builder

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/build"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type BuildResultType string

const (
	BUILD_ERROR BuildResultType = "error"
)

/*
A build returns an array of BuildResults. Every BuildResult has information about
the the source where the problem occured, the line, the column and at least a message
*/
type BuildResult struct {
	Type              BuildResultType `json:"type"`
	Original          string          `json:"original"`
	File              string          `json:"file"`
	Directory         string          `json:"directory"`
	Source            string          `json:"source"`
	Line              int             `json:"line"`
	Column            int             `json:"column"`
	Message           string          `json:"message"`
	PackageName       string          `json:"packagename"`
	PackageImportPath string          `json:"packageimportpath"`
}

type Suggestion struct {
	Class string `json:"class"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Nice  string `json:"nice"`
}

type GoPackage struct {
	ShortName string
	LongName  string
}

type GoStruct struct {
}

type GoWorkspace struct {
	Packages       map[string]*build.Package
	SystemPackages map[string]*build.Package
	Build          []BuildResult
	Path           string
	Workdir        string
	GoPath         []string

	// some private data
	context          build.Context
	neededBy         map[string][]string
	dependencies     map[string][]string
	testneededBy     map[string][]string
	testdependencies map[string][]string
	gobinpath        string
	gocode           *os.Process
}

func NewGoWorkspace(gobin string, gopath []string, gocode *string) *GoWorkspace {
	g := new(GoWorkspace)
	g.gobinpath = gobin
	g.Packages = make(map[string]*build.Package)
	g.SystemPackages = make(map[string]*build.Package)
	g.neededBy = make(map[string][]string)
	g.dependencies = make(map[string][]string)
	g.testneededBy = make(map[string][]string)
	g.testdependencies = make(map[string][]string)
	g.context = build.Default
	g.context.GOPATH = strings.Join(gopath, string(filepath.ListSeparator))
	g.GoPath = gopath
	goroot, err := g.env("GOROOT")
	if err != nil {
		log.Printf("no system packages found, cannot detect GOROOT from '%s': %s", gobin, err)
	} else {
		srcSystem := new(srcDir)
		srcSystem.importer = g.importSystemPackage
		srcSystem.path = filepath.Join(goroot, "src", "pkg")
		filepath.Walk(srcSystem.path, srcSystem.walker)
	}
	g.context.GOROOT = goroot
	g.context.GOARCH, _ = g.env("GOARCH")
	g.context.GOOS, _ = g.env("GOOS")
	log.Printf("CONTEXT:%+v", g.context)
	for i, src := range gopath {
		srcd := new(srcDir)
		srcd.importer = g.importPackage
		srcd.path = filepath.Join(src, "src")
		filepath.Walk(srcd.path, srcd.walker)
		if i == 0 {
			// first element in gopath is special
			g.Path = src
			g.Workdir = filepath.Join(g.Path, workdir)
			// ignore error if directory exists
			os.Mkdir(g.Workdir, 0755)
		}
	}

	g.resolve()

	return g
}

func (ws *GoWorkspace) Shutdown() {
	if ws.gocode != nil {
		ws.gocode.Kill()
	}
}
func (ws *GoWorkspace) BuildPackage(base string, packdir string) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	pack, err := ws.findPackageFromDirectory(packdir)
	if err != nil {
		return nil, nil, fmt.Errorf("findPackageFromDirectory: %s", err)
	}
	err = ws.importPackage(pack, packdir)
	if err != nil {
		// let's ignore this error, it will raise again when building...
		//return nil, nil, fmt.Errorf("importPackage: %s", err)
	}
	args = append(args, pack)
	dirs = append(dirs, ws.findDirectoryFromPackage(pack))
	deps, ok := ws.neededBy[pack]
	if ok {
		args = append(args, deps...)
		for _, d := range deps {
			dirs = append(dirs, ws.findDirectoryFromPackage(d))
		}
	}
	packagesToRecompile := args
	res, err := ws.build(packagesToRecompile...)
	if err != nil {
		return nil, nil, err
	}
	// now for the tests ...
	deps, ok = ws.testneededBy[pack]
	args = []string{pack}
	if ok {
		args = append(args, deps...)
		for _, d := range deps {
			dirs = append(dirs, ws.findDirectoryFromPackage(d))
		}
	}
	res = res + "\n" + ws.buildtests(args...)
	parsed := ws.parseBuildOutput(base, res)
	ws.Build = ws.mergeBuildResults(packagesToRecompile, parsed)
	return &ws.Build, &dirs, nil
}

func (ws *GoWorkspace) FullBuild(base string, ignoredPackages map[string]bool) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	for p, _ := range ws.Packages {
		if _, ok := ignoredPackages[p]; !ok {
			args = append(args, p)
			dirs = append(dirs, ws.findDirectoryFromPackage(p))
		}
	}
	res, err := ws.build(args...)
	if err != nil {
		return nil, nil, err
	}
	parsed := ws.parseBuildOutput(base, res)
	ws.Build = parsed
	return &ws.Build, &dirs, nil
}

func (ws *GoWorkspace) Autocomplete(gocodebin *string, content string, position int) (sug []Suggestion, err error) {
	cmd := exec.Command(*gocodebin, "-f=json", "autocomplete", fmt.Sprintf("%d", position))
	cmd.Env = []string{
		fmt.Sprintf("GOPATH=%s", ws.context.GOPATH),
		fmt.Sprintf("GOROOT=%s", ws.context.GOROOT),
		fmt.Sprintf("GOARCH=%s", ws.context.GOARCH),
		fmt.Sprintf("GOOS=%s", ws.context.GOOS)}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Error no StdoutPipe: %s", err)
		return
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("Error no StdinPipe: %s", err)
		return
	}
	if err = cmd.Start(); err != nil {
		log.Printf("Error when starting gocode process: %s", err)
		return
	}
	stdin.Write([]byte(content))
	stdin.Close()
	out, err := ioutil.ReadAll(stdout)
	if err != nil {
		return
	} else {
		log.Printf("Result gocode: %s", string(out))
	}
	cmd.Wait()
	var found []interface{}
	err = json.Unmarshal(out, &found)
	if err != nil {
		log.Printf("Error parsing gocode output:%s", err)
		return
	}
	if len(found) > 0 {
		// first element is the number of matching chars --> ignore it
		// second element is an array of maps
		arraymatches := found[1].([]interface{})
		for _, m := range arraymatches {
			if suggest, ok := m.(map[string]interface{}); ok {
				class := suggest["class"].(string)
				name := suggest["name"].(string)
				tp := suggest["type"].(string)
				nice := fmt.Sprintf("%s : %s", name, tp)
				if bytes.Equal([]byte("package"), []byte(class)) {
					nice = fmt.Sprintf("Import '%s'", name)
					name = ""
				}
				if strings.HasPrefix(tp, class) {
					nice = fmt.Sprintf("%s%s", name, tp[len(class):])
				}
				sug = append(sug, Suggestion{class, name, tp, nice})
			}
		}
	}
	return
}
