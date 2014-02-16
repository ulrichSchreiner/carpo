package builder

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
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
	Type   TokenType `json:"tokentype"`
	Source string    `json:"source"`
	Name   string    `json:"name"`
	Target string    `json:"target"`
	Line   int       `json:"line"`
}

func ParseSource(src string) ([]TokenPosition, error) {
	fs := token.NewFileSet() // positions are relative to fset
	f, err := parser.ParseFile(fs, "src.go", src, 0)
	if err != nil {
		return nil, err
	}
	return parseFileset(f, fs), nil
}

func parseFileset(f *ast.File, fs *token.FileSet) []TokenPosition {
	var res []TokenPosition

	if f.Name != nil {
		pos := fs.Position(f.Pos())
		tp := TokenPosition{PACKAGE, pos.Filename, f.Name.Name, "", pos.Line}
		res = append(res, tp)
	}
	for _, i := range f.Imports {
		if i.Path != nil {
			pos := fs.Position(f.Pos())
			tp := TokenPosition{IMPORT, pos.Filename, i.Path.Value, "", pos.Line}
			res = append(res, tp)
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
				tp := TokenPosition{METH, pos.Filename, x.Name.Name, *recv, pos.Line}
				res = append(res, tp)
			} else {
				tp := TokenPosition{FUNC, pos.Filename, x.Name.Name, "", pos.Line}
				res = append(res, tp)
			}

		case *ast.GenDecl:
			switch x.Tok {
			case token.CONST:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					pos := fs.Position(vs.Pos())
					tp := TokenPosition{CONST, pos.Filename, vs.Names[0].Name, "", pos.Line}
					res = append(res, tp)
				}
			case token.VAR:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					pos := fs.Position(x.Pos())
					tp := TokenPosition{VAR, pos.Filename, vs.Names[0].Name, "", pos.Line}
					res = append(res, tp)
				}
			case token.TYPE:
				for _, s := range x.Specs {
					vs := s.(*ast.TypeSpec)
					pos := fs.Position(x.Pos())
					tp := TokenPosition{TYPE, pos.Filename, vs.Name.Name, "", pos.Line}
					res = append(res, tp)
				}
			}
		}
	}
	return res
}
