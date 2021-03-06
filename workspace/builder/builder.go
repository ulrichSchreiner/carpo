package builder

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/build"
	"go/parser"
	"go/token"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
)

type goCommand string

const (
	goCommand_build       goCommand = "install"
	goCommand_vet         goCommand = "vet"
	goCommand_env         goCommand = "env"
	goCommand_test        goCommand = "test"
	workdir                         = ".carpowork"
	abssrc                          = "/src/"
	godoc_org                       = "http://api.godoc.org"
	goerr_cantloadpackage           = "can't load package: "
)

var (
	build_line           = regexp.MustCompile("(.*?):(\\d*(:\\d*)?): (.*)")
	go_file_postfix      = []byte(".go")
	expected_declaration = regexp.MustCompile(`found 'IDENT' (\w*)`)
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

func (ws *GoWorkspace) search(def filesystem.WorkspaceFS, cwd, pt string) (filesystem.WorkspaceFS, string, error) {
	if strings.HasPrefix(pt, "../src") {
		return def, pt[2:], nil
	}
	if strings.HasPrefix(pt, def.Base()) {
		return def, pt[len(def.Base()):], nil
	}
	abspath := filepath.Clean(filepath.Join(cwd, pt))
	for _, wfs := range ws.filesystems {
		if strings.HasPrefix(abspath, wfs.Base()) {
			return wfs, abspath[len(wfs.Base()):], nil
		}
	}
	return nil, "", fmt.Errorf("cannot find %s/%s in filesystems", cwd, pt)
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
		ws.Packages[packname] = pack
		ws.addDependency(pack, pack.Imports)
		ws.addTestDependency(pack, pack.TestImports)
	}
	return nil
}

type srcDir struct {
	fs        filesystem.WorkspaceFS
	workspace *GoWorkspace
	importer  func(string, string) error
	path      string
	relpath   string
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
				src.workspace.Typeserver.AddPackage(src.fs, filepath.Join(src.relpath, packname), packname)
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
	cmd.Env = []string{fmt.Sprintf("GOPATH=%s", ws.context.GOPATH), fmt.Sprintf("PATH=%s", os.ExpandEnv("$PATH"))}
	buildLogger.Debugf("execute %#v", cmd)
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

func (ws *GoWorkspace) plugin(command string, dir string, args ...string) (string, error) {
	cmd := exec.Command(filepath.Join(ws.plugindir, "bin", command), args...)
	cmd.Dir = dir
	cmd.Env = []string{fmt.Sprintf("GOPATH=%s", ws.context.GOPATH), fmt.Sprintf("PATH=%s", os.ExpandEnv("$PATH"))}
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
	//-gcflags "-N -l"
	//buildargs := []string{"-race"}

	//args = append(buildargs, args...)
	return ws.gocmd(ws.gobinpath, string(goCommand_build), ws.Workdir, args...)
}

func (ws *GoWorkspace) lint(args ...string) (res string, err error) {
	return ws.plugin("golint", ws.Workdir, args...)
}

func (ws *GoWorkspace) vet(args ...string) (res string, err error) {
	return ws.gocmd(ws.gobinpath, string(goCommand_vet), ws.Workdir, args...)
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

func (ws *GoWorkspace) parseBuildOutput(base filesystem.WorkspaceFS, output string) []BuildResult {
	return ws.parseBuildTypedOutput(base, output, BUILD_ERROR)
}
func (ws *GoWorkspace) parseBuildTypedOutput(base filesystem.WorkspaceFS, output string, etype BuildResultType) []BuildResult {
	var res []BuildResult
	resultset := make(map[BuildResult]bool)
	lines := strings.Split(output, "\n")
	for _, l := range lines {
		if strings.HasPrefix(l, "#") {
			continue
		}
		l = strings.TrimSpace(l)
		b := []byte(l)
		if strings.HasPrefix(l, goerr_cantloadpackage) {
			b = []byte(l[len(goerr_cantloadpackage):])
		}
		m := build_line.FindSubmatch(b)
		if m != nil {
			var br BuildResult
			br.Original = l
			br.Source = string(m[1])
			br.Type = etype
			fs, pt, err := ws.search(base, ws.Workdir, br.Source)
			if err != nil {
				buildLogger.Errorf("cannot parse buildresult : %s", err)
				br.File = br.Source
			} else {
				br.File = pt
				br.Filesystem = fs.Name()
			}
			// we always work in a subdirectory named ".carpowork", so strip the ".." from the filepath
			br.Directory = filepath.Dir(br.File)
			pt, err = ws.findPackageFromDirectory(filepath.Join(base.Base(), br.Directory))
			if err != nil {
				buildLogger.Errorf("cannot find package for directory '%s': %s", br.Directory, err)
			} else {
				br.PackageImportPath = pt
			}
			br.Message = string(m[len(m)-1])
			sourceline := strings.Split(string(m[2]), ":")[0]
			ln, err := strconv.ParseInt(sourceline, 10, 0)
			if err != nil {
				buildLogger.Errorf("Compiler output line cannot be parsed as INT: Output=%s, Message=%s\n", l, err)
			} else {
				br.Line = int(ln)
			}
			if _, ok := resultset[br]; !ok {
				// do not append the same message twice. this can happen, because wie build packages AND their tests
				res = append(res, br)
			}
		} else {
			if len(res) > 0 {
				l = strings.TrimSpace(l)
				if len(l) > 0 {
					last := &res[len(res)-1]
					last.Original = last.Original + " " + l
					last.Message = last.Message + " " + l
				}
			}
		}
	}
	// now parse output
	return res
}

func (ws *GoWorkspace) findRemotePackagesWithName(name string, ignore map[string]bool) (results Godoc_results) {
	resp, err := http.Get(fmt.Sprintf("%s/search?q=%s", godoc_org, name))
	if err != nil {
		return
	}
	defer resp.Body.Close()
	dec := json.NewDecoder(resp.Body)
	dec.Decode(&results)
	return results
}

func (ws *GoWorkspace) findPackagesWithName(name string, ignore map[string]bool) (res []string) {
	for _, v := range ws.SystemPackages {
		pname := v.Name
		importpath := v.ImportPath
		if _, ok := ignore[importpath]; ok {
			continue
		}
		//if bytes.Equal([]byte(name), []byte(pname)) {
		if strings.Contains(pname, name) {
			res = append(res, importpath)
		}
	}
	for _, v := range ws.Packages {
		pname := v.Name
		importpath := v.ImportPath
		if _, ok := ignore[importpath]; ok {
			continue
		}
		//if bytes.Equal([]byte(name), []byte(pname)) {
		if strings.Contains(pname, name) {
			res = append(res, importpath)
		}
	}
	return
}

func (ws *GoWorkspace) findImportsInCode(source string) (res map[string]bool, err error) {
	fset := token.NewFileSet()

	f, err := parser.ParseFile(fset, "source.go", source, parser.ImportsOnly)
	if err != nil {
		return
	}

	res = make(map[string]bool)
	for _, s := range f.Imports {
		v := s.Path.Value
		res[v[1:len(v)-1]] = true // strip off the quotes at both ends
	}
	return
}

func (ws *GoWorkspace) findUnresolvedAt(source string, pos, row, col int) (tok string, err error) {
	fset := token.NewFileSet()

	f, err := parser.ParseFile(fset, "source.go", source, parser.DeclarationErrors)
	if err != nil {
		if strings.HasPrefix(err.Error(), fmt.Sprintf("source.go:%d", row+1)) {
			subm := expected_declaration.FindStringSubmatch(err.Error())
			if subm != nil {
				tok = subm[1]
				err = nil
			}
		}
		return
	}

	for _, s := range f.Unresolved {
		offs := len(s.Name) + fset.Position(s.NamePos).Offset
		if offs == pos {
			tok = s.Name
			return
		}
	}
	return "", errors.New("no unresolved found")
}
