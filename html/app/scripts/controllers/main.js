'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope, $document, Workspaceservice, ace) {

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
	//$scope.currentfile = {};
	$scope.currentfile = null;

	$scope.newClientFile = function (f, path) {
		// create an ace-editorsession here !!!
		var res = {};
		res.title = f.title;
		res.path = path;
		res.content = f.content;
		res.mode = f.filemode;
		res.dirty = false;
		res.buildresult = "";
		res.type = null;
		var fn = f.title.toLowerCase();
		if (fn != null) {
			var suffix = fn.split(".");
			res.type = $scope.acemodes[suffix[suffix.length-1]];
		}
		return res;
	}

    $scope.chabs = function (idx) {
		var dr = "/";
		for (var i=0; i<=idx; i++) {
			dr = dr + $scope.workspace.pathentries[i]+"/";
		}
		$scope.selectFileElement(dr,true);
    };
	$scope.selectFile = function(f) {
		$scope.currentfile = f;
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
			//$scope.currentfile.content = null;
			//$scope.currentfile.title = null;
			$scope.currentfile = null;
		}
	};

	$scope.saveFile = function (f, pos) {
		var doc = {path:f.path, content:f.content, mode:f.mode, build:true};
		Workspaceservice.save(doc, function(d) {
			if (d.data.ok) {
				f.dirty = false;
				f.buildresult = d.data.buildresult;
				var p = $scope.outputParser[d.data.buildtype];
				if (p != null)
					p(f, d.data.buildresult);
				if ($scope.currentfile.path == f.path) {
					//
					$scope._aceEditor.setValue(d.data.formattedcontent);
					if (pos != null) {
						$scope._aceEditor.moveCursorToPosition(pos);
					}
				} else {
					f.content = d.data.formattedcontent;
				}
			}
		});
	}
	$scope.openFile = function (f)  {
		var fn = $scope.data.cwd+f;
		Workspaceservice.file(fn, function(d) {
			var newItems = [];
			var nf = $scope.newClientFile (d.data, fn);
			for (var i=0; i<$scope.openfiles.length; i++) {
				var fl = $scope.openfiles[i];
				if (fl.path != nf.path) {
					newItems.push(fl);
				} else {
					// file already open, compare content before loading new one in editor?
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
				var pos = $scope._aceEditor.getCursorPosition();
				$scope.saveFile($scope.currentfile, pos);
			}
        })
	};

    $scope.aceChanged = function(e) {
		if ($scope.currentfile != null) {
			$scope.currentfile.dirty = true;
			$scope.currentfile.content = $scope._aceEditor.getValue();
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
	// build output parsers
	$scope.parseOutput_golang = function (f, res) {
		var fname = f.title;
		$scope._aceEditor.getSession().clearAnnotations();
		var lines = res.split("\n");
		if (lines.length<1) return;
		var compOutput = new RegExp("(\\./"+fname+"?):(\\d*):(.*)");
		var annotations = [];
		for (var i=1;i<lines.length; i++) {
			var m = compOutput.exec(lines[i]);
			if (m != null) {
				annotations.push({
                  row: parseInt(m[2])-1,
                  column: 0,
                  text: m[3],
                  type: "error"
                });
			}
		}
		$scope._aceEditor.getSession().setAnnotations(annotations);
	};
	$scope.outputParser = {
		"golang":$scope.parseOutput_golang
	};

    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
