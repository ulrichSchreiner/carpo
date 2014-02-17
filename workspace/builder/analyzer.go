package builder

import (
	"fmt"
	"github.com/ulrichSchreiner/carpo/workspace/filesystem"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
)

/*
Analyze Go Code an return meta information about the code
*/

type TokenType string

const (
	PACKAGE TokenType = "PACKAGE"
	IMPORT  TokenType = "IMPORT"
	CONST   TokenType = "CONST"
	VAR     TokenType = "VAR"
	FUNC    TokenType = "FUNC"
	METH    TokenType = "METHOD"
	TYPE    TokenType = "TYPE"
)

type TokenPosition struct {
	Type       TokenType `json:"tokentype"`
	Source     string    `json:"source"`
	Name       string    `json:"name"`
	Target     string    `json:"target"`
	Line       int       `json:"line"`
	Filesystem string    `json:"filesystem"`
	Filename   string    `json:"filename"`
	Package    string    `json:"gopackage"`
}

func ParsePath(fs filesystem.WorkspaceFS, pt string) ([]TokenPosition, error) {
	fset := token.NewFileSet()
	fpt := fs.Abs(filepath.Dir(pt))
	f, err := parser.ParseDir(fset, fpt, nil, 0)
	if err != nil {
		return nil, err
	}
	var res []TokenPosition

	for _, p := range f {
		for _, f := range p.Files {
			res = append(res, parseFileset(fs, f, fset)...)
		}
	}

	return res, nil
}

func ParseSource(src string) ([]TokenPosition, error) {
	fs := token.NewFileSet() // positions are relative to fset
	f, err := parser.ParseFile(fs, "src.go", src, 0)
	if err != nil {
		return nil, err
	}
	return parseFileset(nil, f, fs), nil
}

func appendTokenPosition(fs filesystem.WorkspaceFS, ar []TokenPosition, pos token.Position, name, target string, tt TokenType) []TokenPosition {
	pt := pos.Filename
	var fsname string
	if fs != nil {
		fsname = fs.Name()
		if pat, err := filepath.Rel(fs.Base(), pos.Filename); err == nil {
			pt = pat
		} else {
			buildLogger.Errorf("Path is not relative to Filesystem: %s", err)
		}
	}
	tp := TokenPosition{tt, "/" + pt, name, target, pos.Line, fsname, filepath.Base(pos.Filename), "/" + filepath.Dir(pt)}
	return append(ar, tp)
}

func parseFileset(wks filesystem.WorkspaceFS, f *ast.File, fs *token.FileSet) []TokenPosition {
	var res []TokenPosition

	if f.Name != nil {
		res = appendTokenPosition(wks, res, fs.Position(f.Pos()), f.Name.Name, "", PACKAGE)
	}
	for _, i := range f.Imports {
		if i.Path != nil {
			res = appendTokenPosition(wks, res, fs.Position(f.Pos()), i.Path.Value, "", IMPORT)
		}
	}
	for _, d := range f.Decls {
		switch x := d.(type) {
		case *ast.FuncDecl:
			pos := fs.Position(x.Pos())
			if x.Recv != nil {
				var recv *string
				n := x.Recv.List[0].Type
				id, ok := n.(*ast.Ident)
				if !ok {
					sid, ok := n.(*ast.StarExpr)
					if ok {
						id, ok = sid.X.(*ast.Ident)
						if ok {
							r := fmt.Sprintf("*%s", id.Name)
							recv = &r
						}
					}
				} else {
					recv = &id.Name
				}
				res = appendTokenPosition(wks, res, pos, x.Name.Name, *recv, METH)
			} else {
				res = appendTokenPosition(wks, res, pos, x.Name.Name, "", FUNC)
			}

		case *ast.GenDecl:
			switch x.Tok {
			case token.CONST:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					res = appendTokenPosition(wks, res, fs.Position(vs.Pos()), vs.Names[0].Name, "", CONST)
				}
			case token.VAR:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					res = appendTokenPosition(wks, res, fs.Position(vs.Pos()), vs.Names[0].Name, "", VAR)
				}
			case token.TYPE:
				for _, s := range x.Specs {
					vs := s.(*ast.TypeSpec)
					res = appendTokenPosition(wks, res, fs.Position(vs.Pos()), vs.Name.Name, "", TYPE)
				}
			}
		}
	}
	return res
}
