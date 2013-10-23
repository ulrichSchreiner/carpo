'use strict';

angular.module('htmlApp')
  .service('Workspaceservice', function Workspaceservice() {
	var service = {};
    var h = window.location.hostname;
    var p = window.location.port;
    var prot = window.location.protocol=="http:" ? "ws://" : "wss://";

    //var ws = new WebSocket(prot+h+":"+p+"/workspace");

  	service.connect = function() {
	    if(service.ws) { return; }
	 
	    var ws = new WebSocket(prot+h+":"+p+"/workspace");
	 
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
 
  	return service;
  });
