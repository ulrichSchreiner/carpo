package golang

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
)

type Syntax struct {
	Contents *ast.File
}

func (s *Syntax) visit(n ast.Node) bool {
	switch x := n.(type) {
	case *ast.File:
		s.Contents = x
		return false
	}

	return true
}

func Parse(source string, fname string) (*Syntax, error) {
	var r Syntax
	fset := token.NewFileSet()
	fs, err := parser.ParseFile(fset, fname, source, 0)
	if err != nil {
		fmt.Printf("-> ERROR: %v\n", err)
		if fs != nil {
			ast.Print(fset, fs)
		}
		return nil, err
	}
	ast.Inspect(fs, r.visit)
	ast.Print(fset, fs)
	fmt.Printf("PACKAGE: %s\n", r.Contents.Name.Name)
	for _, i := range r.Contents.Imports {
		if i != nil {
			fmt.Printf("IMPORT: %s\n", i.Path.Value)
		}
	}
	return &r, nil
}
