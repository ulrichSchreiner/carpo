package server

import (
	"fmt"
	"net/http"
)

type dummy struct {
	nothing string
}

func Start(port int) {
	http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}
