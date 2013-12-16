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

type goCommand string

const (
	goCommand_build goCommand = "install"
	goCommand_env   goCommand = "env"
	goCommand_test  goCommand = "test"
	workdir                   = ".carpowork"
	abssrc                    = "/src/"
)

var (
	build_line      = regexp.MustCompile("(.*?):(\\d*(:\\d*)?): (.*)")
	go_file_postfix = []byte(".go")
)

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

func (ws *GoWorkspace) importSystemPackage(packname string, path string) error {
	// systempackages are only imported at startup time so we only import them once
	_, ok := ws.SystemPackages[packname]
	if ok {
		return nil
	}
	pack, err := ws.context.Import(packname, path, 0)
	if err != nil {
		return err
	} else {
		ws.SystemPackages[packname] = pack
	}
	return nil
}

func (ws *GoWorkspace) importPackage(packname string, path string) error {
	pack, err := ws.context.Import(packname, path, 0)
	if err != nil {
		return err
	} else {
		//TODO change this, set a ignore-list in the workspace
		//if bytes.Compare([]byte(pack.Name), []byte("testdata")) != 0 {
		if bytes.Compare([]byte(pack.Name), []byte("main")) != 0 {
			ws.Packages[packname] = pack
			ws.addDependency(pack, pack.Imports)
			ws.addTestDependency(pack, pack.TestImports)
		}
	}
	return nil
}

type srcDir struct {
	importer func(string, string) error
	path     string
}

func (src *srcDir) walker(path string, info os.FileInfo, err error) error {
	if info != nil && !info.IsDir() {
		if bytes.Compare([]byte(strings.ToLower(filepath.Ext(info.Name()))), go_file_postfix) == 0 {
			// we have a go file :-)
			//TODO: check if this directory was already imported
			rel, err := filepath.Rel(src.path, path)
			if err != nil {
				// the walker found a subdir of "src.path" but filepath.Rel says no ...
				// this cannot happen, but if this happens, something terrible happend ...
			} else {
				packname := filepath.Dir(rel)
				src.importer(packname, path)
			}
		}
	}
	return nil
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

func (ws *GoWorkspace) env(key string) (root string, err error) {
	root, err = ws.gocmd(ws.gobinpath, string(goCommand_env), ws.Workdir, key)
	if err == nil {
		root = strings.TrimSpace(root)
	}
	return
}

func (ws *GoWorkspace) build(args ...string) (res string, err error) {
	res, err = ws.gocmd(ws.gobinpath, string(goCommand_build), ws.Workdir, args...)
	if err == nil {
		//res = res + "\n" + ws.buildtests(gobin, args...)
	}
	return res, err
}

func (ws *GoWorkspace) buildtests(args ...string) (res string) {
	for _, p := range args {
		if ws.packageHasTests(p) {
			testres, testerr := ws.gocmd(ws.gobinpath, string(goCommand_test), ws.Workdir, "-c", p)
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
		m := build_line.FindSubmatch(b)
		if m != nil {
			var br BuildResult
			br.Original = l
			br.Source = string(m[1])
			br.Type = BUILD_ERROR
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
