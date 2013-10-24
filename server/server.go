package server

import (
	"fmt"
	"net/http"
)

func Start(port int) {
	http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}
