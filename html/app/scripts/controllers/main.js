'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope,Workspaceservice) {

    var workspace = {};
    workspace.entries = [];
    workspace.path = "";
    workspace.pathentries = [];
    $scope.workspace = workspace;
    $scope.cwd = "/";
    var handler = {
    	open : function(e) {
    		$scope.chdir($scope.cwd);
    	},
    	error : function(e) {
    		console.log("on error",e);
    	},
    	message : function(e) {
    		console.log("on message",e);
    	}
    };
    $scope.chabs = function (idx) {
    	var dr = "";
    	for (var i=0; i<=idx; i++) {
    		dr = dr + $scope.workspace.pathentries[i]+"/";
    	}
    	$scope.chdir(dr);
    };
    $scope.chdir = function (dr) {
    	if (dr[0] == "/")
    		$scope.cwd = dr;
    	else
    		$scope.cwd = $scope.cwd + dr + "/";
	    Workspaceservice.dir($scope.cwd,function (d) {
	    	console.log("dir = ",d);
	    	$scope.workspace = d.data;
	    });    	
    }
    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
