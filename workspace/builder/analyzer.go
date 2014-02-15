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
	var res []TokenPosition

	if f.Name != nil {
		tp := TokenPosition{PACKAGE, "", f.Name.Name, "", fs.Position(f.Pos()).Line}
		res = append(res, tp)
	}
	for _, i := range f.Imports {
		if i.Path != nil {
			tp := TokenPosition{IMPORT, "", i.Path.Value, "", fs.Position(i.Pos()).Line}
			res = append(res, tp)
		}
	}
	for _, d := range f.Decls {
		switch x := d.(type) {
		case *ast.FuncDecl:
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
				tp := TokenPosition{METH, "", x.Name.Name, *recv, fs.Position(x.Pos()).Line}
				res = append(res, tp)
			} else {
				tp := TokenPosition{FUNC, "", x.Name.Name, "", fs.Position(x.Pos()).Line}
				res = append(res, tp)
			}

		case *ast.GenDecl:
			switch x.Tok {
			case token.CONST:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					tp := TokenPosition{CONST, "", vs.Names[0].Name, "", fs.Position(vs.Pos()).Line}
					res = append(res, tp)
				}
			case token.VAR:
				for _, s := range x.Specs {
					vs := s.(*ast.ValueSpec)
					tp := TokenPosition{VAR, "", vs.Names[0].Name, "", fs.Position(vs.Pos()).Line}
					res = append(res, tp)
				}
			case token.TYPE:
				for _, s := range x.Specs {
					vs := s.(*ast.TypeSpec)
					tp := TokenPosition{TYPE, "", vs.Name.Name, "", fs.Position(vs.Pos()).Line}
					res = append(res, tp)
				}
			}
		}
	}
	return res, nil
}
