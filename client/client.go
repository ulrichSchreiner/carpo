package client

import (
	"fmt"
	"net/http"
)

var index_html = `
<html ng-app>
<head>
<script src="http://code.angularjs.org/1.2.0-rc.3/angular.min.js"></script>
<title>Test</title>
</head>
<script>
var h = window.location.hostname;
var p = window.location.port;
var prot = window.location.protocol=="http:" ? "ws://" : "wss://";

var ws = new WebSocket(prot+h+":"+p+"/workspace");

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

func xinit() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, index_html)
	})
}

func Init(cp string) {
	http.Handle("/", http.FileServer(http.Dir(cp)))
}
