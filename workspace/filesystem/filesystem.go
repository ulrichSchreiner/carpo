package filesystem

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// An abstraction of a filesystem how we need it.
type WorkspaceFS interface {
	Base() string
	Name() string
	Abs(name string) string
	Open(name string, flag int, fm os.FileMode) (WorkspaceFile, error)
	Create(name string) (WorkspaceFile, error)
	Stat(name string) (os.FileInfo, error)
	RemoveAll(name string) error
	Mkdir(name string, mode os.FileMode) error
}

type WorkspaceFile interface {
	io.ReadWriteCloser
	Readdir(n int) (fi []os.FileInfo, err error)
}

type wksFS struct {
	name string
	base string
}

func NewFS(name, base string) WorkspaceFS {
	return &wksFS{name, base}
}

func (fs *wksFS) Name() string {
	return fs.name
}
func (fs *wksFS) Base() string {
	return fs.base
}
func (fs *wksFS) Abs(name string) string {
	return filepath.Join(fs.base, name)
}
func (fs *wksFS) Open(name string, flag int, fm os.FileMode) (WorkspaceFile, error) {
	return os.OpenFile(filepath.Join(fs.base, name), flag, fm)
}
func (fs *wksFS) Create(name string) (WorkspaceFile, error) {
	return os.Create(filepath.Join(fs.base, name))
}
func (fs *wksFS) Stat(name string) (os.FileInfo, error) {
	return os.Stat(filepath.Join(fs.base, name))
}
func (fs *wksFS) RemoveAll(path string) error {
	return os.RemoveAll(filepath.Join(fs.base, path))
}
func (fs *wksFS) Mkdir(path string, mode os.FileMode) error {
	return os.MkdirAll(filepath.Join(fs.base, path), mode)
}

func AbsolutePathWrite(fs WorkspaceFS, cpath string) (string, string, WorkspaceFile, error) {
	return absolutePath(fs, cpath, os.O_RDWR|os.O_TRUNC, 0666)
}
func AbsolutePath(fs WorkspaceFS, cpath string) (string, string, WorkspaceFile, error) {
	return absolutePath(fs, cpath, os.O_RDONLY, 0666)
}
func absolutePath(fs WorkspaceFS, cpath string, flag int, fm os.FileMode) (string, string, WorkspaceFile, error) {
	path := filepath.Join(fs.Base(), "./"+cpath)
	rpath, err := filepath.Rel(fs.Base(), path)
	if err != nil {
		return "", "", nil, err
	}
	if fl, err := fs.Open(rpath, flag, fm); err != nil {
		return "", "", nil, err
	} else {
		return filepath.Join(fs.Base(), rpath), rpath, fl, nil
	}
}

func FindFilesystem(abspath string, fs map[string]WorkspaceFS) (WorkspaceFS, string, error) {
	for _, wfs := range fs {
		base := wfs.Base()
		if strings.HasPrefix(abspath, base) {
			rel, err := filepath.Rel(base, abspath)
			if err != nil {
				return nil, "", err
			}
			return wfs, fmt.Sprintf("/%s", rel), nil
		}
	}
	return nil, "", fmt.Errorf("no Filesystem found for path %s", abspath)
}
