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
	$scope.openfiles = [];
	
    var handler = {
    	open : function(e) {
    		$scope.selectFileElement($scope.data.cwd, true);
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
    	$scope.selectFileElement(dr,true);
    };
	$scope.selectFile = function (f)  {
		var fn = $scope.data.cwd+f;
		Workspaceservice.file(fn, function(d) {
			console.log(d);
			$scope.openfiles.push({title:d.data.title, content:d.data.content});
			$scope.content = d.data.content;
		});
	};
    $scope.selectFileElement = function (dr,isdir) {
		if (!isdir) {
			$scope.selectFile(dr);
			return;
		}
    	if (dr[0] == "/")
    		$scope.data.cwd = dr;
    	else
    		$scope.data.cwd = $scope.data.cwd + dr +"/";
	    Workspaceservice.dir($scope.data.cwd,function (d) {
			for (var e in d.data) {
				$scope.workspace[e] = d.data[e];
			}
			//$scope.workspace = d.data;
	    });    	
    }
	$scope.aceLoaded = function(_editor) {
      // Options
	  _editor.setReadOnly(true);
	};

    $scope.aceChanged = function(e) {
      //
    };

    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
