package builder

import (
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	BUILD_LINE = regexp.MustCompile("(.*?):(\\d*(:\\d*)?): (.*)")
)

type BuildResult struct {
	Original string `json:"original"`
	File     string `json:"file"`
	Source   string `json:"source"`
	Line     int    `json:"line"`
	Message  string `json:"message"`
}

func BuildGoPackage(base string, gopath string, gotool string, packdir string) []BuildResult {
	cmd := exec.Command(gotool, "build")
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
