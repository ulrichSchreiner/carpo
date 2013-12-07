package builder

import (
	"bytes"
	"fmt"
	"go/build"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const (
	BUILD_COMMAND = "install"
	TEST_COMMAND  = "test"
	WORKDIR       = ".carpowork"
	ABSSRC        = "/src/"
)

var (
	BUILD_LINE      = regexp.MustCompile("(.*?):(\\d*(:\\d*)?): (.*)")
	GO_FILE_POSTFIX = []byte(".go")
)

type BuildResult struct {
	Original          string `json:"original"`
	File              string `json:"file"`
	Directory         string `json:"directory"`
	Source            string `json:"source"`
	Line              int    `json:"line"`
	Column            int    `json:"column"`
	Message           string `json:"message"`
	PackageName       string `json:"packagename"`
	PackageImportPath string `json:"packageimportpath"`
}

type GoWorkspace struct {
	Packages map[string]*build.Package
	Build    []BuildResult
	Path     string
	Workdir  string
	GoPath   []string
	// some private data
	context          build.Context
	neededBy         map[string][]string
	dependencies     map[string][]string
	testneededBy     map[string][]string
	testdependencies map[string][]string
}

func (ws *GoWorkspace) findPackageFromDirectory(dir string) (string, error) {
	for _, gp := range ws.GoPath {
		srcdir := filepath.Join(gp, "src")
		if strings.HasPrefix(dir, srcdir) {
			return filepath.Rel(srcdir, dir)
		}
	}
	return "", fmt.Errorf("Directory '%s' not found in GOPATH (%+v)", dir, ws.GoPath)
}

func (ws *GoWorkspace) findDirectoryFromPackage(p string) string {
	return filepath.Join("src", p)
}

func (ws *GoWorkspace) addDependency(p *build.Package, needs []string) {
	ws.dependencies[p.ImportPath] = needs
}
func (ws *GoWorkspace) addTestDependency(p *build.Package, needs []string) {
	ws.testdependencies[p.ImportPath] = needs
}

func (ws *GoWorkspace) resolveDeps(deps *map[string][]string, needs *map[string][]string) {
	for p, pkgs := range *deps {
		for _, pack := range pkgs {
			packs, ok := (*needs)[pack]
			if !ok {
				packs = []string{p}
			} else {
				packs = append(packs, p)
			}
			(*needs)[pack] = packs
		}
	}
}

func (ws *GoWorkspace) packageHasTests(packname string) bool {
	p, ok := ws.Packages[packname]
	if ok {
		return len(p.TestGoFiles) > 0
	}
	return false
}

func (ws *GoWorkspace) resolve() {
	ws.resolveDeps(&ws.dependencies, &ws.neededBy)
	ws.resolveDeps(&ws.testdependencies, &ws.testneededBy)
}

func (ws *GoWorkspace) importPackage(packname string, path string) error {
	pack, err := ws.context.Import(packname, path, 0)
	if err != nil {
		return err
	} else {
		if bytes.Compare([]byte(pack.Name), []byte("main")) != 0 {
			ws.Packages[packname] = pack
			ws.addDependency(pack, pack.Imports)
			ws.addTestDependency(pack, pack.TestImports)
		}
	}
	return nil
}

type srcDir struct {
	ws       *GoWorkspace
	path     string
	packages []build.Package
}

func (src *srcDir) walker(path string, info os.FileInfo, err error) error {
	if !info.IsDir() {
		if bytes.Compare([]byte(strings.ToLower(filepath.Ext(info.Name()))), GO_FILE_POSTFIX) == 0 {
			// we have a go file :-)
			rel, err := filepath.Rel(src.path, path)
			if err != nil {
				// well if this happens, something terrible happend ...
			} else {
				packname := filepath.Dir(rel)
				src.ws.importPackage(packname, path)
			}
		}
	}
	return nil
}
func Scan(gopath []string) *GoWorkspace {
	g := new(GoWorkspace)
	g.Packages = make(map[string]*build.Package)
	g.neededBy = make(map[string][]string)
	g.dependencies = make(map[string][]string)
	g.testneededBy = make(map[string][]string)
	g.testdependencies = make(map[string][]string)
	g.context = build.Default
	g.context.GOPATH = strings.Join(gopath, string(filepath.ListSeparator))
	g.GoPath = gopath
	for i, src := range gopath {
		srcd := new(srcDir)
		srcd.ws = g
		srcd.path = filepath.Join(src, "src")
		filepath.Walk(src, srcd.walker)
		if i == 0 {
			// first element in gopath is special
			g.Path = src
			g.Workdir = filepath.Join(g.Path, WORKDIR)
			// ignore error if directory exists
			os.Mkdir(g.Workdir, 0755)
		}
	}
	g.resolve()
	return g
}

func (ws *GoWorkspace) BuildPackage(base string, gotool string, packdir string) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	pack, err := ws.findPackageFromDirectory(packdir)
	if err != nil {
		return nil, nil, fmt.Errorf("findPacakgeFromDirectory: %s", err)
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
	res, err := ws.build(gotool, packagesToRecompile...)
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
	res = res + "\n" + ws.buildtests(gotool, args...)
	parsed := ws.parseBuildOutput(base, res)
	ws.Build = ws.mergeBuildResults(packagesToRecompile, parsed)
	return &ws.Build, &dirs, nil
}

func (ws *GoWorkspace) FullBuild(base string, gotool string) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	for p, _ := range ws.Packages {
		args = append(args, p)
		dirs = append(dirs, ws.findDirectoryFromPackage(p))
	}
	res, err := ws.build(gotool, args...)
	if err != nil {
		return nil, nil, err
	}
	parsed := ws.parseBuildOutput(base, res)
	ws.Build = parsed
	return &ws.Build, &dirs, nil
}

func (ws *GoWorkspace) mergeBuildResults(compiledPackages []string, res []BuildResult) (bs []BuildResult) {
	m := make(map[string]bool)
	for _, s := range compiledPackages {
		m[s] = true
	}
	for _, br := range ws.Build {
		if _, ok := m[br.PackageImportPath]; !ok {
			bs = append(bs, br)
		}
	}
	for _, br := range res {
		if !containsBuildResult(bs, br) {
			bs = append(bs, br)
		}
	}
	return
}

func containsBuildResult(results []BuildResult, br BuildResult) bool {
	for _, b := range results {
		if b == br {
			return true
		}
	}
	return false
}

func (ws *GoWorkspace) gocmd(gobin string, command string, dir string, args ...string) (string, error) {
	arguments := []string{command}
	arguments = append(arguments, args...)
	cmd := exec.Command(gobin, arguments...)
	cmd.Dir = dir
	cmd.Env = []string{fmt.Sprintf("GOPATH=%s", ws.context.GOPATH)}
	res, err := cmd.CombinedOutput()
	if err != nil {
		// check if the command resulted with an error-exit code
		if _, ok := err.(*exec.ExitError); !ok {
			// no Exit-Error --> a fundamental problem occured
			return "", err
		}
	}
	return string(res), nil
}

func (ws *GoWorkspace) build(gobin string, args ...string) (res string, err error) {
	res, err = ws.gocmd(gobin, BUILD_COMMAND, ws.Workdir, args...)
	if err == nil {
		//res = res + "\n" + ws.buildtests(gobin, args...)
	}
	return res, err
}

func (ws *GoWorkspace) buildtests(gobin string, args ...string) (res string) {
	for _, p := range args {
		if ws.packageHasTests(p) {
			testres, testerr := ws.gocmd(gobin, TEST_COMMAND, ws.Workdir, "-c", p)
			if testerr == nil && !strings.HasPrefix(testres, "?") {
				res = res + "\n" + testres
			}
		}
	}
	return
}

func (ws *GoWorkspace) parseBuildOutput(base string, output string) []BuildResult {
	var res []BuildResult
	lines := strings.Split(output, "\n")
	for _, l := range lines {
		b := []byte(l)
		m := BUILD_LINE.FindSubmatch(b)
		if m != nil {
			var br BuildResult
			br.Original = l
			br.Source = string(m[1])
			// we always work in a subdirectory named ".carpowork", so strip the ".." from the filepath
			br.File = br.Source[2:]
			br.Directory = filepath.Dir(br.File)
			pt, err := ws.findPackageFromDirectory(filepath.Join(base, br.Directory))
			if err != nil {
				log.Printf("cannot find package for directory '%s': %s", br.Directory, err)
			} else {
				br.PackageImportPath = pt
			}
			br.Message = string(m[len(m)-1])
			sourceline := strings.Split(string(m[2]), ":")[0]
			ln, err := strconv.ParseInt(sourceline, 10, 0)
			if err != nil {
				log.Printf("Compiler output line cannot be parsed as INT: Output=%s, Message=%s\n", l, err)
			} else {
				br.Line = int(ln)
			}
			res = append(res, br)
		} else {
			if len(res) > 0 {
				l = strings.TrimSpace(l)
				last := &res[len(res)-1]
				last.Original = last.Original + " " + l
				last.Message = last.Message + " " + l
			}
		}
	}
	// now parse output
	return res
}
