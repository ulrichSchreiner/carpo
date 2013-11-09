package client

import (
	"archive/zip"
	"bytes"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path"
)

var resources *zip.ReadCloser

func Init(cp string) {
	//http.Handle("/", http.FileServer(http.Dir(cp)))
}

func InitResources() {
	resources, err := zip.OpenReader(os.Args[0])
	if err != nil {
		mypath, err := exec.LookPath(os.Args[0])
		if err != nil {
			log.Fatal(err)
		} else {
			resources, err = zip.OpenReader(mypath)
			if err != nil {
				log.Fatal(err)
			}
		}
	}
	entries := make(map[string]*zip.File)
	for _, f := range resources.File {
		entries["/"+f.Name] = f
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		pt := r.URL.Path
		if bytes.Compare([]byte(pt), []byte("/")) == 0 {
			pt = "/index.html"
		}
		zf := entries[pt]
		if zf == nil {
			http.NotFound(w, r)
			return
		}
		mimetype := mime.TypeByExtension(path.Ext(pt))
		if mimetype != "" {
			w.Header().Set("Content-Type", mimetype)
		}
		rc, err := zf.Open()
		if err != nil {
			log.Printf("Error opening zip entry: %s", err)
		} else {
			defer rc.Close()
			io.Copy(w, rc)
		}
	})
}
