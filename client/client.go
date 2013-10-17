package client

import (
	"fmt"
	"net/http"
)

var index_html = `
<html>
<head>
<title>Test</title>
</head>
<script>
var ws = new WebSocket("ws://localhost:8787/workspace");
ws.onopen = function (){
	console.log("on open");
}
ws.onmessage = function(evt) {
	console.log("message: ",evt);
}
ws.onclose = function () {
	console.log("on close");
}
</script>
<body>
Test Body
</body>
</html>`

func init() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, index_html)
	})
}
