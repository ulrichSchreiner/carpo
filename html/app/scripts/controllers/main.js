'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope,Workspaceservice) {

    var workspace = {};
    workspace.entries = [];
    workspace.path = "";
    workspace.pathentries = [];
    $scope.workspace = workspace;
	$scope.data = {};
    $scope.data.cwd = "/";
    var handler = {
    	open : function(e) {
    		$scope.chdir($scope.data.cwd);
			//$scope.chabs(-1);
			console.log("init scope:",$scope);
    	},
    	error : function(e) {
    		console.log("on error",e);
    	},
    	message : function(e) {
    		console.log("on message",e);
    	}
    };
    $scope.chabs = function (idx) {
    	var dr = "/";
    	for (var i=0; i<=idx; i++) {
    		dr = dr + $scope.workspace.pathentries[i]+"/";
    	}
    	$scope.chdir(dr);
    };
    $scope.chdir = function (dr) {
    	if (dr[0] == "/")
    		$scope.data.cwd = dr;
    	else
    		$scope.data.cwd = $scope.data.cwd + dr + "/";
	    Workspaceservice.dir($scope.data.cwd,function (d) {
			for (var e in d.data) {
				$scope.workspace[e] = d.data[e];
			}
			//$scope.workspace = d.data;
	    });    	
    }
    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
