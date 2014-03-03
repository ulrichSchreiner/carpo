package builder

import (
	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
	"launchpad.net/loggo"
	"path/filepath"
	"sync"
)

var typeserviceLogger = loggo.GetLogger("typeservice")

type TypeService interface {
	ListPackages() []string
	ByPackage(pkg string) []TokenPosition
	ByPath(path string) []TokenPosition
	Search(element string) []TokenPosition
	AddPackage(fs filesystem.WorkspaceFS, path, pkg string)
	RefreshPackage(fs filesystem.WorkspaceFS, path, pkg string)
	Close()
}

type package_cmd struct {
	fs      filesystem.WorkspaceFS
	path    string
	pkg     string
	refresh bool
}

type service struct {
	lock     sync.RWMutex
	packages map[string][]TokenPosition
	srcpath  map[string][]TokenPosition
	commands chan interface{}
}

func (s *service) ListPackages() []string {
	s.lock.RLock()
	defer s.lock.RUnlock()

	var res []string
	for k, _ := range s.packages {
		res = append(res, k)
	}
	return res
}

func (s *service) ByPackage(pkg string) []TokenPosition {
	t, _ := s.packages[pkg]
	return t
}

func (s *service) ByPath(path string) []TokenPosition {
	t, _ := s.srcpath[path]
	return t
}

func (s *service) Search(element string) []TokenPosition {
	s.lock.RLock()
	defer s.lock.RUnlock()

	var res []TokenPosition
	for _, v := range s.packages {
		for _, t := range v {
			m, err := filepath.Match(element, t.Name)
			if err != nil {
				// only possible error is BadPattern, so we log it and return
				// the pattern cannot be better in the next iteration
				typeserviceLogger.Errorf("error matching: %s", err)
				return res
			}
			if m {
				res = append(res, t)
			}
		}
	}
	return res
}
func (s *service) Close() {
	close(s.commands)
}

func (s *service) AddPackage(fs filesystem.WorkspaceFS, path, pkg string) {
	c := package_cmd{fs, path, pkg, false}
	s.commands <- c
}
func (s *service) RefreshPackage(fs filesystem.WorkspaceFS, path, pkg string) {
	c := package_cmd{fs, path, pkg, true}
	s.commands <- c
}
func (s *service) addPackage(fs filesystem.WorkspaceFS, path, pkg string, refresh bool) {
	s.lock.Lock()
	defer s.lock.Unlock()
	current, found := s.packages[pkg]
	if found && !refresh {
		return // package already parsed
	}
	toks, err := ParseDirPath(fs, path)
	if err != nil {
		typeserviceLogger.Errorf("cannot parse path [%s]: %s", path, err)
	} else {
		typeserviceLogger.Infof("add package %s (%s)", pkg, path)
		if refresh {
			current = toks
		} else {
			current = append(current, toks...)
		}
		s.packages[pkg] = current
		s.srcpath[path] = current
	}
}

func (s *service) start() {
	for {
		select {
		case c, ok := <-s.commands:
			if !ok {
				return
			}
			switch pc := c.(type) {
			case package_cmd:
				s.addPackage(pc.fs, pc.path, pc.pkg, pc.refresh)
			}
		}
	}
}

func NewTypeService() TypeService {
	s := service{}
	s.packages = make(map[string][]TokenPosition)
	s.srcpath = make(map[string][]TokenPosition)
	s.commands = make(chan interface{}, 100) // allow async send's
	go s.start()
	return &s
}
