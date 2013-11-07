'use strict';

angular.module('htmlApp')
  .service('Workspaceservice', function Workspaceservice($http) {
	var service = {};
    var h = window.location.hostname;
    var p = window.location.port;
    var prot = window.location.protocol=="http:" ? "ws://" : "wss://";

    //var ws = new WebSocket(prot+h+":"+p+"/workspace");

  	service.connect = function() {
	    if(service.ws) { return; }

	    var ws = new WebSocket(prot+h+":"+p+"/wsworkspace");

	    ws.onopen = function(e) {
	      service.callback.open(e);
	    };

	    ws.onerror = function(e) {
	      service.callback.error(e);
	    }

	    ws.onmessage = function(e) {
	      service.callback.message(e);
	    };

	    service.ws = ws;
	}

  	service.send = function(message) {
    	service.ws.send(message);
  	}

  	service.subscribe = function(callback) {
    	service.callback = callback;
  	}

 	service.dir = function (pt, callback) {
 		$http.get("/workspace/dir?path="+pt).then(function (data) {
 			callback(data);
 		});
 	};
 	service.createdir = function (pt, callback) {
 		$http.get("/workspace/mkdir?path="+pt).then(function (data) {
 			callback(data);
 		});
 	};
 	service.createfile = function (pt, callback) {
 		$http.get("/workspace/touch?path="+pt).then(function (data) {
 			callback(data);
 		});
 	};
 	service.rm = function (pt, callback) {
		return $http.get("/workspace/rm?path="+pt);
 	};

 	service.file = function (pt, callback) {
 		$http.get("/workspace/file?path="+pt).then(function (data) {
 			callback(data);
 		});
 	};
 	service.save = function (doc, callback) {
 		$http.post("/workspace/save",angular.toJson(doc)).then(function (data) {
 			callback(data);
 		});
 	};

	return service;
  });
