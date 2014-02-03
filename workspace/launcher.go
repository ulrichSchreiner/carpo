package workspace

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"text/template"
)

type launchConfig struct {
	id               string
	name             string
	executable       string
	workingDirectory string
	parameters       []string
	environment      []string
}

func (ws *workspace) getLaunchConfig(launchid string) (*launchConfig, error) {
	config := ws.config["runconfig"].(map[string]interface{})
	configs := config["configs"].(map[string]interface{})
	runconfig, ok := configs[launchid]
	if !ok {
		return nil, fmt.Errorf("No launch config for id '%s' found", launchid)
	}
	rc := runconfig.(map[string]interface{})
	var res launchConfig
	res.id = rc["id"].(string)
	res.name = rc["name"].(string)
	res.executable = rc["executable"].(string)
	wd, ok := rc["workingDirectory"]
	if ok {
		res.workingDirectory = wd.(string)
	}
	par, ok := rc["params"]
	if ok {
		res.parameters = parseParameters(par.(string))
	}
	env, ok := rc["environment"]
	if ok {
		res.environment = parseEnvironment(env.(string))
	}
	return ws.resolve(&res)
}

func (ws *workspace) launch(lc *launchConfig) *exec.Cmd {
	cmd := exec.Command(lc.executable, lc.parameters...)
	cmd.Dir = lc.workingDirectory
	cmd.Env = lc.environment
	cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: 9}
	return cmd
}

func (ws *workspace) resolve(lc *launchConfig) (*launchConfig, error) {
	gobin := ws.gobinpath()
	vals := struct {
		Workspace string
		GoBin     string
	}{
		filepath.Clean(ws.Path), *gobin,
	}
	var err error
	lc.executable, err = parse(lc.executable, vals)
	if err != nil {
		return nil, err
	}
	lc.workingDirectory, err = parse(lc.workingDirectory, vals)
	if err != nil {
		return nil, err
	}
	for i, p := range lc.parameters {
		lc.parameters[i], err = parse(p, vals)
		if err != nil {
			return nil, err
		}
	}
	for i, p := range lc.environment {
		lc.environment[i], err = parse(p, vals)
		if err != nil {
			return nil, err
		}
	}
	return lc, nil
}

func parse(templ string, vals interface{}) (string, error) {
	t, err := template.New("t").Parse(templ)
	if err != nil {
		return "", err
	}
	var b bytes.Buffer
	if err := t.Execute(&b, vals); err != nil {
		return "", err
	}
	return os.ExpandEnv(string(b.Bytes())), nil
}

func parseEnvironment(env string) []string {
	return strings.Split(env, "\n")
}

func parseParameters(params string) (res []string) {
	fields := strings.Fields(params)
	param := ""
	for _, f := range fields {
		if f[0] == '"' && f[len(f)-1] == '"' {
			f = f[1 : len(f)-1]
		}
		if f[0] == '"' {
			param = param + f[1:]
		} else if f[len(f)-1] == '"' {
			param = param + " " + f[0:len(f)-1]
			res = append(res, param)
			param = ""
		} else {
			if len(param) > 0 {
				param = param + f
			} else {
				res = append(res, f)
			}
		}
	}
	return
}
