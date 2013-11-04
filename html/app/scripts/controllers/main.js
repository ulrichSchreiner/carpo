'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope, $document, Workspaceservice) {

	$scope.acemodes = {
		".md":"markdown",
		".go":"golang",
		".js":"javascript",
		".html":"html",
		".xml":"xml",
		".yaml":"yaml"
	};

	$document.keydown(function(event) {

		if (!( String.fromCharCode(event.which).toLowerCase() == 's' && event.ctrlKey) && !(event.which == 19)) return true;
		//alert("Ctrl-s pressed");
		event.preventDefault();
		console.log("global save:",event);
		return false;
	});

	var workspace = {};
	workspace.entries = [];
	workspace.path = "";
	workspace.pathentries = [];
	$scope.workspace = workspace;
	$scope.data = {};
	$scope.data.cwd = "/";
	$scope.openfiles = [];
	$scope.currentfile = {};

    $scope.chabs = function (idx) {
		var dr = "/";
		for (var i=0; i<=idx; i++) {
			dr = dr + $scope.workspace.pathentries[i]+"/";
		}
		$scope.selectFileElement(dr,true);
    };
	$scope.selectFile = function(f) {
		$scope.currentfile.title = f.title;
		$scope.currentfile.content = f.content;
		$scope.currentfile.file = f;
		var fn = f.title.toLowerCase();
		if (fn != null) {
			var suffix = fn.split(".");
			var mode = $scope.acemodes[suffix[suffix.length-1]];
			if (mode != null) {
				$scope._aceEditor.getSession().setMode("ace/mode/" + mode);
			}
		}
	};
	$scope.closeFile = function (f) {
		var newItems = [];
		for (var i=0; i<$scope.openfiles.length; i++) {
			var fl = $scope.openfiles[i];
			if (fl.title != f.title) {
				newItems.push(fl);
			} else {
				// file to close ...
				// perhaps save dialog here ???
			}
		}
		$scope.openfiles = newItems;
		if (newItems.length>0) {
			selectFile(newItems[0]);
		} else {
			$scope.currentfile.content = null;
			$scope.currentfile.title = null;
			$scope.currentfile.file = null;
		}
	};

	$scope.saveFile = function (f) {
		var doc = {path:f.path, content:f.content, mode:f.mode};
		Workspaceservice.save(doc, function(d) {
			console.log(d);
			if (d.data.ok) {
				f.dirty = false;
			}
		});
	}
	$scope.openFile = function (f)  {
		var fn = $scope.data.cwd+f;
		Workspaceservice.file(fn, function(d) {
			var newItems = [];
			var nf = {title:d.data.title, content:d.data.content, dirty:false, path:fn, mode:d.data.filemode};
			console.log("openFile:",d);
			for (var i=0; i<$scope.openfiles.length; i++) {
				var fl = $scope.openfiles[i];
				if (fl.path != nf.path) {
					newItems.push(fl);
				} else {
					// file already open
					fl.content = nf.content;
					fl.title = nf.title;
					fl.path = fn;
					$scope.selectFile(nf);
					return;
				}
			}

			newItems.push(nf);
			$scope.openfiles = newItems;
			$scope.selectFile(nf);
		});
	};
    $scope.selectFileElement = function (dr,isdir) {
		if (!isdir) {
			$scope.openFile(dr);
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
	    });
    }
	$scope.aceLoaded = function(_editor) {
      // Options
	 // _editor.setReadOnly(true);
		$scope._aceEditor = _editor;
		_editor.commands.addCommand({
			name: "saveDocument",
			bindKey: {win: "Ctrl-S", mac: "Command-S"},
			exec: function(editor) {
				console.log("Save:",editor);
				$scope.saveFile($scope.currentfile.file);
			}
        })
	};

    $scope.aceChanged = function(e) {
		if ($scope.currentfile.file != null) {
			$scope.currentfile.file.dirty = true;
			$scope.currentfile.file.content = $scope._aceEditor.getValue();
		}
    };
	var handler = {
	    	open : function(e) {
	    		$scope.selectFileElement($scope.data.cwd, true);
	    	},
	    	error : function(e) {
	    		console.log("on error",e);
	    	},
	    	message : function(e) {
	    		console.log("on message",e);
	    	}
	};
    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
