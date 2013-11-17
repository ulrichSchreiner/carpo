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
							log.Printf("found package '%s' in dir '%s'\n", pack.Name, pack.ImportPath)
							log.Printf("go files in package: %+v\n", pack.GoFiles)
							log.Printf("imports of package: %+v\n", pack.Imports)
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
	for _, src := range gopath {
		srcd := new(srcDir)
		srcd.ws = g
		srcd.path = filepath.Join(src, "src")
		filepath.Walk(src, srcd.walker)
	}
	g.resolve()
	return g
}

func (ws *GoWorkspace) BuildPackage(base string, gotool string, packdir string) (*[]BuildResult, error) {
	args := []string{"install"}
	pack, err := ws.findPackageFromDirectory(packdir)
	if err != nil {
		return nil, err
	}
	args = append(args, pack)
	deps, ok := ws.neededBy[pack]
	if ok {
		args = append(args, deps...)
	}
	log.Printf("compile args: %+v\n", args)
	cmd := exec.Command(gotool, args...)
	cmd.Dir = packdir
	cmd.Env = []string{fmt.Sprintf("GOPATH=%s", ws.context.GOPATH)}
	res, _ := cmd.CombinedOutput()
	parsed := parseBuildOutput(base, packdir, string(res))
	return &parsed, nil
}

func parseBuildOutput(base string, packdir string, output string) []BuildResult {
	var res []BuildResult
	lines := strings.Split(output, "\n")
	for _, l := range lines {
		b := []byte(l)
		m := BUILD_LINE.FindSubmatch(b)
		if m != nil {
			var br BuildResult
			br.Original = l
			br.Source = string(m[1])
			rel, err := filepath.Rel(base, filepath.Join(packdir, br.Source))
			if err != nil {
				log.Printf("source is not in workspace: %s", err)
				br.File = filepath.Join(packdir, br.Source)
			} else {
				br.File = "/" + rel
			}
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
		}
	}
	// now parse output
	return res
}
