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
)

var (
	BUILD_LINE      = regexp.MustCompile("(.*?):(\\d*(:\\d*)?): (.*)")
	GO_FILE_POSTFIX = []byte(".go")
)

type BuildResult struct {
	Original  string `json:"original"`
	File      string `json:"file"`
	Directory string `json:"directory"`
	Source    string `json:"source"`
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	Message   string `json:"message"`
}

type GoWorkspace struct {
	Packages map[string]*build.Package
	Build    []BuildResult
	Path     string
	GoPath   []string
	// some private data
	context      build.Context
	neededBy     map[string][]string
	dependencies map[string][]string
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

func (ws *GoWorkspace) resolve() {
	for p, pkgs := range ws.dependencies {
		for _, pack := range pkgs {
			packs, ok := ws.neededBy[pack]
			if !ok {
				packs = []string{p}
			} else {
				packs = append(packs, p)
			}
			ws.neededBy[pack] = packs
		}
	}
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
				pack, ok := src.ws.Packages[packname]
				if !ok {
					pack, err = src.ws.context.Import(filepath.Dir(rel), path, 0)
					if err != nil {
						log.Printf("import error: %s, %+v\n", err, pack)
					} else {
						if bytes.Compare([]byte(pack.Name), []byte("main")) != 0 {
							src.ws.Packages[packname] = pack
							src.ws.addDependency(pack, pack.Imports)
						}
					}
				}
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
		return nil, nil, err
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
	res, err := ws.build(gotool, ws.Path, args...)
	if err != nil {
		return nil, nil, err
	}
	parsed := parseBuildOutput(base, res)
	return &parsed, &dirs, nil
}

func (ws *GoWorkspace) FullBuild(base string, gotool string) (*[]BuildResult, *[]string, error) {
	args := []string{}
	dirs := []string{}
	for p, _ := range ws.Packages {
		args = append(args, p)
		dirs = append(dirs, ws.findDirectoryFromPackage(p))
	}
	res, err := ws.build(gotool, ws.Path, args...)
	if err != nil {
		return nil, nil, err
	}
	parsed := parseBuildOutput(base, res)
	return &parsed, &dirs, nil
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

func (ws *GoWorkspace) build(gobin string, dir string, args ...string) (string, error) {
	return ws.gocmd(gobin, BUILD_COMMAND, dir, args...)
}

func parseBuildOutput(base string, output string) []BuildResult {
	var res []BuildResult
	lines := strings.Split(output, "\n")
	for _, l := range lines {
		b := []byte(l)
		m := BUILD_LINE.FindSubmatch(b)
		if m != nil {
			var br BuildResult
			br.Original = l
			br.Source = string(m[1])
			br.File = "/" + br.Source

			br.Directory = filepath.Dir(br.File)
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
