'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope, $document, Workspaceservice, ace, $modal) {

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
	$scope.snapOpts = {
		touchToDrag : false
	};
	var workspace = {};
	workspace.entries = [];
	workspace.path = "";
	workspace.pathentries = [];
	$scope.workspace = workspace;
	$scope.data = {};
	$scope.data.root = "";
	$scope.data.rootpathentries = [];
	$scope.data.cwd = "/";
	$scope.openfiles = [];
	$scope.alerts = [];
	$scope.currentfile = null;
	$scope.config = {};

	$scope.$watch("config", function(d) {
		Workspaceservice.saveConfig($scope.config).then(function (e) {
			//console.log("config saved:",e);
			$scope._aceEditor.setFontSize($scope.config.fontSize);
		});
	}, true);

	$scope.filterPathElement = function (pe) {
		return pe != "."
	};

	$scope.addAlert = function(message) {
    		$scope.alerts.push({type:"error", msg: message});
	};

	$scope.closeAlert = function(index) {
		$scope.alerts.splice(index, 1);
	};

	$scope.newClientFile = function (f, path) {
		// create an ace-editorsession here !!!
		var res = {};
		res.title = f.title;
		res.path = path;
		res.content = f.content;
		res.mode = f.filemode;
		res.dirty = false;
		res.buildresult = "";
		res.type = "text";
		var fn = f.title.toLowerCase();
		if (fn != null) {
			var suffix = fn.split(".");
			var tp = $scope.acemodes["."+suffix[suffix.length-1]];
			if (tp != null)
				res.type = tp;
		}
		var mode = ace.require("ace/ext/modelist").getModeForPath(f.title);
		res.session = ace.createEditSession(f.content, mode.mode)
		return res;
	}

	$scope.deleteFileElement = function(f) {
		Workspaceservice.rm($scope.data.root+$scope.data.cwd+f.name).then(function (d) {
			$scope.refreshWorkspaceWithFileElementResult(d.data);
	    }, function(e) {
			$scope.addAlert(e.data.Message);
		});
	};

	$scope.createFile = function () {
	  var modalInstance = $modal.open({
      	templateUrl: 'views/createFileElement.html',
      	controller: 'CreatefileElementCtrl',
		resolve: {
           elementType: function() { return "File";},
		  parentDir: function() { return $scope.data.root+$scope.data.cwd; }
      	}
    	  });

      modalInstance.result.then(function (item) {
		var pt = $scope.data.root+$scope.data.cwd+item;
		Workspaceservice.createfile(pt,function (d) {
			for (var e in d.data) {
				$scope.workspace[e] = d.data[e];
			}
	    });
      });
	};

	$scope.createFolder = function () {
	  var modalInstance = $modal.open({
      	templateUrl: 'views/createFileElement.html',
      	controller: 'CreatefileElementCtrl',
		resolve: {
           elementType: function() { return "Directory";},
		  parentDir: function() { return $scope.data.root+$scope.data.cwd; }
      	}
    	  });

      modalInstance.result.then(function (item) {
		var pt = $scope.data.root+$scope.data.cwd+item;
		Workspaceservice.createdir(pt,function (d) {
			for (var e in d.data) {
				$scope.workspace[e] = d.data[e];
			}
	    });
      });
	};

    $scope.chabs = function (idx) {
		var dr = "/";
		for (var i=0; i<=idx; i++) {
			dr = dr + $scope.workspace.pathentries[i]+"/";
		}
		$scope.selectFileElement(dr,true);
    };
	$scope.selectFile = function(f) {
		$scope.currentfile = f;
		$scope._aceEditor.setSession(f.session);
	};

	$scope.closeFile = function (f) {
		var newItems = [];
		for (var i=0; i<$scope.openfiles.length; i++) {
			var fl = $scope.openfiles[i];
			if (fl.title != f.title) {
				newItems.push(fl);
			} else {
				f.session.setValue("");
				// file to close ...
				// perhaps save dialog here ???
			}
		}
		$scope.openfiles = newItems;
		if (newItems.length>0) {
			$scope.selectFile(newItems[0]);
		} else {
			//$scope.currentfile.content = null;
			//$scope.currentfile.title = null;
			$scope.currentfile = null;
		}
	};

	$scope.saveFile = function (f) {
		var doc = {path:f.path, content:f.session.getValue(), mode:f.mode, build:true};
		Workspaceservice.save(doc, function(d) {
			if (d.data.ok) {
				f.dirty = false;
				f.buildresult = d.data.buildresult;
				var pos = null;
				if (f.session = $scope._aceEditor.getSession())
					pos = $scope._aceEditor.getCursorPosition();
				f.session.setValue(d.data.formattedcontent);
				f.content = d.data.formattedcontent;
				if (pos != null)
					$scope._aceEditor.moveCursorToPosition(pos);
				var p = $scope.outputParser[d.data.buildtype];
				if (p != null)
					p(f, d.data.buildresult);
			}
		});
	}
	$scope.openFile = function (f)  {
		var fn = $scope.data.root+$scope.data.cwd+f;
		Workspaceservice.file(fn, function(d) {
			var newItems = [];
			var nf = null;
			for (var i=0; i<$scope.openfiles.length; i++) {
				var fl = $scope.openfiles[i];
				if (fl.path != fn) {
					newItems.push(fl);
				} else {
					// file already open, compare content before loading new one in editor?
					nf = fl;
					nf.content = d.data.content;
					$scope.selectFile(nf);
					return;
				}
			}
			nf = $scope.newClientFile (d.data, fn);

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
		Workspaceservice.dir($scope.data.root+$scope.data.cwd,function (d) {
			$scope.refreshWorkspaceWithFileElementResult(d.data);
	    });
    };
	$scope.refreshWorkspaceWithFileElementResult = function(r) {
		for (var e in r) {
			if (e == "pathentries")
				$scope.workspace[e] = r[e].slice($scope.data.rootpathentries.length);
			else
				$scope.workspace[e] = r[e];
		}
	};
	$scope.editorSettings = function () {
		var modalInstance = $modal.open({
 	     	templateUrl: 'views/editorsettings.html',
 	     	controller: 'EditorSettingsCtrl',
			resolve: {
				config:function() {return $scope.config;}
 	     	}
	    });

      	modalInstance.result.then(function (item) {
			$scope.config.fontSize = item.fontSize;
			$scope.config.hidefiles = item.hidefiles;
			//console.log(item);
      	});
	};
	$scope.displayFile = function (f) {
		// hidden files: ^\..*
		if ($scope.config.hidefiles != null && $scope.config.hidefiles!=="") {
			return new RegExp($scope.config.hidefiles).exec(f.name) == null;
		}
		return true;
	};
	$scope.resetRoot = function() {
		$scope.data.root = "";
		$scope.data.rootpathentries = [];
		$scope.data.cwd = "/";
		$scope.selectFileElement("/",true);
		$scope.config.basedirectory = $scope.data.root;
	};
	$scope.changeRoot = function() {
		$scope.setRoot($scope.data.cwd.slice(0,-1));
	};
	$scope.setRoot = function(rt) {
		$scope.data.root = rt;
		$scope.data.rootpathentries = $scope.data.root.slice(1).split("/");
		$scope.data.cwd = "/";
		$scope.selectFileElement("/",true);
		$scope.config.basedirectory = $scope.data.root;
	};
	$scope.aceLoaded = function(_editor) {
      // Options
	 // _editor.setReadOnly(true);
		$scope._aceEditor = _editor;
		_editor.commands.addCommand({
			name: "saveDocument",
			bindKey: {win: "Ctrl-S", mac: "Command-S"},
			exec: function(editor) {
				$scope.saveFile($scope.currentfile);
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
		f.session.clearAnnotations();
		var lines = res.split("\n");
		if (lines.length<1) return;
		//var compOutput = new RegExp("(\\./"+fname+"?):(\\d*):(.*)");
		var compOutput = new RegExp("("+fname+"?):(\\d*):(.*)");
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
		f.session.setAnnotations(annotations);
	};
	$scope.outputParser = {
		"golang":$scope.parseOutput_golang
	};
	Workspaceservice.loadConfig().then (function (d) {
		$scope.config = d.data;
		$scope.setRoot($scope.config.basedirectory);
		//$scope.chabs(0);
	});

    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
