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
	// some private data
	context build.Context
}

type srcDir struct {
	ws   *GoWorkspace
	path string
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
							src.ws.Packages[packname] = pack
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
	g.context = build.Default
	g.context.GOPATH = strings.Join(gopath, string(filepath.ListSeparator))
	for _, src := range gopath {
		srcd := new(srcDir)
		srcd.ws = g
		srcd.path = filepath.Join(src, "src")
		filepath.Walk(src, srcd.walker)
	}
	return g
}

func BuildGoPackage(base string, gopath string, gotool string, packdir string) []BuildResult {
	cmd := exec.Command(gotool, "install")
	cmd.Dir = packdir
	cmd.Env = []string{fmt.Sprintf("GOPATH=%s", gopath)}
	res, _ := cmd.CombinedOutput()
	return parseBuildOutput(base, packdir, string(res))
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
