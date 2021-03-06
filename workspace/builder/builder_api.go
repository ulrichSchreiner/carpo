package builder

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/build"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
	"launchpad.net/loggo"
)

type BuildResultType string

var buildLogger = loggo.GetLogger("builder")

const (
	BUILD_ERROR   BuildResultType = "error"
	BUILD_WARNING BuildResultType = "warning"
)

/*
A build returns an array of BuildResults. Every BuildResult has information about
the the source where the problem occured, the line, the column and at least a message
*/
type BuildResult struct {
	Type              BuildResultType `json:"type"`
	Original          string          `json:"original"`
	Filesystem        string          `json:"filesystem"`
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
	Meta  string `json:"meta"`
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
	FirstPath      string
	Workdir        string
	GoPath         []string
	GoPathString   string
	DefaultFS      filesystem.WorkspaceFS
	Typeserver     TypeService

	// some private data
	context            build.Context
	neededBy           map[string][]string
	dependencies       map[string][]string
	testneededBy       map[string][]string
	testdependencies   map[string][]string
	gobinpath          string
	plugindir          string
	gocode             *os.Process
	filesystems        map[string]filesystem.WorkspaceFS
	filesystemsOrdered []filesystem.WorkspaceFS
}

type Godoc_result_entity struct {
	Path     string `json:"path"`
	Synopsis string `json:"synopsis"`
}

type Godoc_results struct {
	Results []Godoc_result_entity `json:"results"`
}

func append_workspace_if_not_present(ws string, gp string) string {
        if gp == "" {
            return ws
        }
	gplist := filepath.SplitList(gp)
	for _, gpe := range gplist {
		if gpe == ws {
			return gp
		}
	}
	return fmt.Sprintf("%s%s%s", ws, string(filepath.ListSeparator), gp)
}

func NewGoWorkspace(gobin string, wspath string, gocode *string, plugindir string, fs map[string]filesystem.WorkspaceFS) *GoWorkspace {
	g := new(GoWorkspace)
	g.Typeserver = NewTypeService()
	g.gobinpath = gobin
	g.plugindir = plugindir
	g.filesystems = fs
	g.Packages = make(map[string]*build.Package)
	g.SystemPackages = make(map[string]*build.Package)
	g.neededBy = make(map[string][]string)
	g.dependencies = make(map[string][]string)
	g.testneededBy = make(map[string][]string)
	g.testdependencies = make(map[string][]string)
	g.context = build.Default
	buildLogger.Infof("GOPATH from environment: %s", g.context.GOPATH)
	gopath := append_workspace_if_not_present(wspath, g.context.GOPATH)
	g.context.GOPATH = gopath
	buildLogger.Infof("new GOPATH : %s", g.context.GOPATH)
	g.GoPathString = gopath
	g.GoPath = filepath.SplitList(gopath)
	goroot, err := g.env("GOROOT")
	if err != nil {
		buildLogger.Errorf("no system packages found, cannot detect GOROOT from '%s': %s", gobin, err)
	} else {
		g.filesystems["GOROOT"] = filesystem.NewFS("GOROOT", filepath.Clean(goroot))
		srcSystem := new(srcDir)
		srcSystem.workspace = g
		srcSystem.fs = g.filesystems["GOROOT"]
		srcSystem.importer = g.importSystemPackage
		srcSystem.relpath = filepath.Join("/", "src", "pkg")
		srcSystem.path = filepath.Join(goroot, "src", "pkg")
		filepath.Walk(srcSystem.path, srcSystem.walker)
	}
	g.context.GOROOT = goroot
	g.context.GOARCH, _ = g.env("GOARCH")
	g.context.GOOS, _ = g.env("GOOS")
	for i, src := range g.GoPath {
		fs := filesystem.NewFS(filepath.Base(src), filepath.Clean(src))
		srcd := new(srcDir)
		srcd.fs = fs
		srcd.workspace = g
		srcd.importer = g.importPackage
		srcd.path = filepath.Join(src, "src")
		srcd.relpath = "/src"
		filepath.Walk(srcd.path, srcd.walker)
		if i == 0 {
			// first element in gopath is special
			g.FirstPath = src
			g.Workdir = filepath.Join(g.FirstPath, workdir)
			// ignore error if directory exists
			os.Mkdir(g.Workdir, 0755)
			g.DefaultFS = fs
		} else {
		}
		g.filesystems[filepath.Base(src)] = fs
		g.filesystemsOrdered = append(g.filesystemsOrdered, fs)
	}
	g.filesystemsOrdered = append(g.filesystemsOrdered, g.filesystems["GOROOT"])

	g.resolve()

	return g
}

func (ws *GoWorkspace) WorkspaceFS() filesystem.WorkspaceFS {
	return ws.filesystemsOrdered[0]
}

func (ws *GoWorkspace) RootFS() []string {
	var res []string
	for _, f := range ws.filesystemsOrdered {
		res = append(res, f.Name())
	}
	return res
}

func (ws *GoWorkspace) Shutdown() {
	if ws.gocode != nil {
		ws.gocode.Kill()
	}
}
func (ws *GoWorkspace) BuildPackage(base filesystem.WorkspaceFS, packdir string, vet, lint bool) (*[]BuildResult, *[]string, error) {
	//args := []string{}
	//dirs := []string{}
	pack, err := ws.findPackageFromDirectory(packdir)
	if err != nil {
		return nil, nil, fmt.Errorf("findPackageFromDirectory: %s", err)
	}
	err = ws.importPackage(pack, packdir)
	if err != nil {
		// let's ignore this error, it will raise again when building...
		//return nil, nil, fmt.Errorf("importPackage: %s", err)
	}
	srcdir := ws.findDirectoryFromPackage(pack)
	ws.Typeserver.RefreshPackage(base, "/"+srcdir, pack)
	var sdirs, tdirs, packagesToRecompile []string
	var buildres, testres string
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		args := []string{pack}
		sdirs = append(sdirs, srcdir)
		deps, ok := ws.neededBy[pack]
		if ok {
			args = append(args, deps...)
			for _, d := range deps {
				sdirs = append(sdirs, ws.findDirectoryFromPackage(d))
			}
		}
		packagesToRecompile = args
		res, err := ws.build(packagesToRecompile...)
		if err == nil {
			buildres = res
		}
		buildLogger.Debugf("build result: %#v: %s", res, err)
		wg.Done()
	}()
	// now for the tests ...
	wg.Add(1)
	go func() {
		deps, ok := ws.testneededBy[pack]
		args := []string{pack}
		if ok {
			args = append(args, deps...)
			for _, d := range deps {
				tdirs = append(tdirs, ws.findDirectoryFromPackage(d))
			}
		}
		testres = ws.buildtests(args...)
		wg.Done()
	}()
	wg.Wait()
	res := buildres + "\n" + testres
	//res = res + "\n" + ws.buildtests(args...)
	parsed := ws.parseBuildOutput(base, res)
	if vet && len(parsed) == 0 {
		// vet only if no compile error
		vetres, err := ws.vet(packagesToRecompile...)
		if err == nil {
			vetparsed := ws.parseBuildTypedOutput(base, vetres, BUILD_WARNING)
			parsed = append(parsed, vetparsed...)
		}
	}
	if lint && len(parsed) == 0 {
		// lint only if no compile error
		lintres, err := ws.lint(packdir)
		buildLogger.Debugf("lintres: %#v: %s", lintres, err)
		if err == nil {
			lintparsed := ws.parseBuildTypedOutput(base, lintres, BUILD_WARNING)
			parsed = append(parsed, lintparsed...)
		}
	}
	ws.Build = ws.mergeBuildResults(packagesToRecompile, parsed)
	sdirs = append(sdirs, tdirs...)
	return &ws.Build, &sdirs, nil
}

func (ws *GoWorkspace) FullBuild(base filesystem.WorkspaceFS, ignoredPackages map[string]bool) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	for p, _ := range ws.Packages {
		ignore := false
		for ip, _ := range ignoredPackages {
			if strings.HasPrefix(p, ip) {
				ignore = true
				break
			}
		}

		if !ignore {
			args = append(args, p)
			dirs = append(dirs, ws.findDirectoryFromPackage(p))
		}
	}
	buildLogger.Debugf("full build with %+v", args)
	res, err := ws.build(args...)
	if err != nil {
		return nil, nil, err
	}
	var vres *string
	if len(res) == 0 {
		svres, err := ws.vet(args...)
		if err != nil {
			return nil, nil, err
		}
		vres = &svres
	}
	parsed := ws.parseBuildOutput(base, res)
	if vres != nil {
		vparsed := ws.parseBuildTypedOutput(base, *vres, BUILD_WARNING)
		parsed = append(parsed, vparsed...)
	}
	ws.Build = append(parsed)
	return &ws.Build, &dirs, nil
}

func (ws *GoWorkspace) InstallPackage(pkg string, plugindir string) (err error) {
	cmd := exec.Command(ws.gobinpath, "get", "-u", pkg)
	cmd.Dir = plugindir
	cmd.Env = []string{
		fmt.Sprintf("GOPATH=%s", ws.GoPathString),
		os.ExpandEnv("PATH=$PATH"), // git must be installed!
	}
	buildLogger.Infof("install %s: %+v", pkg, cmd)
	_, err = cmd.CombinedOutput()
	return err
}

func (ws *GoWorkspace) InstallPlugin(plugindir string, repo, binname string) (gocodebinpath *string, err error) {
	cmd := exec.Command(ws.gobinpath, "get", "-u", repo)
	cmd.Dir = plugindir
	cmd.Env = []string{
		fmt.Sprintf("GOPATH=%s", plugindir),
		os.ExpandEnv("PATH=$PATH"), // git must be installed!
	}
	buildLogger.Infof("install %s: %+v", binname, cmd)
	out, err := cmd.CombinedOutput()
	if err == nil {
		gopath := filepath.Join(plugindir, "bin", binname)
		return &gopath, nil
	} else {
		err = fmt.Errorf("Error installing '%s': %s (%v)", binname, string(out), err)
	}
	return
}

func (ws *GoWorkspace) InstallGocode(plugindir string) (gocodebinpath *string, err error) {
	return ws.InstallPlugin(plugindir, "github.com/nsf/gocode", "gocode")
}

func (ws *GoWorkspace) QueryPackages() (res Godoc_results) {
	for _, p := range ws.SystemPackages {
		res.Results = append(res.Results, Godoc_result_entity{Path: p.ImportPath, Synopsis: ""})
	}
	for _, p := range ws.Packages {
		res.Results = append(res.Results, Godoc_result_entity{Path: p.ImportPath, Synopsis: ""})
	}
	return
}

func (ws *GoWorkspace) QueryRemotePackages(q string) Godoc_results {
	m := make(map[string]bool)
	return ws.findRemotePackagesWithName(q, m)
}

func (ws *GoWorkspace) Autocomplete(gocodebin *string, content string, path string, position int, row, col int, appengine bool) (sug []Suggestion, err error) {
	cmd := exec.Command(*gocodebin, "-f=json", "autocomplete", path, fmt.Sprintf("%d", position))
	goarch := ws.context.GOARCH
	if appengine {
		goarch = fmt.Sprintf("%s_appengine", goarch)
	}
	cmd.Env = []string{
		fmt.Sprintf("GOPATH=%s", ws.context.GOPATH),
		fmt.Sprintf("GOROOT=%s", ws.context.GOROOT),
		fmt.Sprintf("GOARCH=%s", goarch),
		fmt.Sprintf("GOOS=%s", ws.context.GOOS)}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		buildLogger.Errorf("Error no StdoutPipe: %s", err)
		return
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		buildLogger.Errorf("Error no StdinPipe: %s", err)
		return
	}
	if err = cmd.Start(); err != nil {
		buildLogger.Errorf("Error when starting gocode process: %s", err)
		return
	}
	stdin.Write([]byte(content))
	stdin.Close()
	out, err := ioutil.ReadAll(stdout)
	if err != nil {
		buildLogger.Errorf("Error reading from stdout: %s", err)
		return
	}
	cmd.Wait()
	var found []interface{}
	err = json.Unmarshal(out, &found)
	if err != nil {
		buildLogger.Errorf("Error parsing gocode output:%s", err)
		return
	}
	ignore, err := ws.findImportsInCode(content)
	if err != nil {
		ignore = make(map[string]bool)
	}
	unres, err2 := ws.findUnresolvedAt(content, position, row, col)
	if err2 == nil {
		packs := ws.findPackagesWithName(unres, ignore)
		for _, pack := range packs {
			nice := fmt.Sprintf("Import '%s'", pack)
			sug = append(sug, Suggestion{"import", pack, "import", nice, "Local Package"})
		}
		if len(packs) == 0 {
			// no local packages found, search for something to install ...
			godocpacks := ws.findRemotePackagesWithName(unres, ignore)
			for _, pack := range godocpacks.Results {
				nice := fmt.Sprintf("Install '%s'", pack.Path)
				sug = append(sug, Suggestion{"install", pack.Path, "install", nice, "Remote Package"})
			}
		}
		sug = append(sug, Suggestion{})
	} else {
		buildLogger.Errorf("cannot find unresolved: %s", err2)
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
				meta := ""
				if bytes.Equal([]byte("package"), []byte(class)) {
					nice = name
				}
				if strings.HasPrefix(tp, class) {
					nice = fmt.Sprintf("%s%s", name, tp[len(class):])
				}
				sug = append(sug, Suggestion{class, name, tp, nice, meta})
			}
		}
	}
	return
}
