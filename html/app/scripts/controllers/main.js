'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope, $document, Workspaceservice, ace, $modal) {

	$document.keydown(function(event) {
		if (!( String.fromCharCode(event.which).toLowerCase() == 's' && event.ctrlKey) && !(event.which == 19)) return true;
		event.preventDefault();
		return false;
	});
	$scope.snapOpts = {
		touchToDrag : false
	};
    $scope.gridOptions = {
        data: [],
        enablePinning: true,
        columnDefs: [{ field: "source", width: 120, pinned: true },
                    { field: "line", width: 120 },
                    { field: "message", width: 520 }]
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
    $scope.config.hidefiles = '^\\..*';
    $scope.problems = {};
    $scope.problems.errors = [];
    $scope.$watch("problems.errors", function(e) {
       $scope.gridOptions.data = $scope.problems.errors; 
       console.log("grid data:",$scope.gridOptions.data);
    });
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
        $scope.showAnnotations(f, $scope.problems.errors);
	};

    $scope.closeAll = function () {
        angular.forEach ($scope.openfiles, function (f) {
           f.session.setValue("");
           f.session = null;
        });
        $scope.openfiles = [];
        $scope.currentfile = null;
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
        var builder = $scope.config.apptype;
        if (builder != null) {
            builder = $scope.config[builder];
        }
		var doc = {path:f.path, content:f.session.getValue(), mode:f.mode, build:true, builder:builder, buildtype:$scope.config.apptype};
		Workspaceservice.save(doc, function(d) {
			if (d.data.ok) {
				f.dirty = false;
				var pos = null;
				if (f.session = $scope._aceEditor.getSession())
					pos = $scope._aceEditor.getCursorPosition();
				f.session.setValue(d.data.formattedcontent);
				f.content = d.data.formattedcontent;
				if (pos != null) {
					$scope._aceEditor.moveCursorToPosition(pos);
                    $scope._aceEditor.scrollToLine(pos.row, true, false, function() {});
				}
                $scope.pushOutput(f, d.data);
                $scope.showAnnotations(f, $scope.problems.errors);
			}
            else {
                $scope.addAlert(d.data.message);
            }
		});
	}
    $scope.openFilePath = function (fn, cb) {
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
                    if (cb != null)
                        cb(nf);
					return;
				}
			}
			nf = $scope.newClientFile (d.data, fn);

			newItems.push(nf);
			$scope.openfiles = newItems;
			$scope.selectFile(nf);
            if (cb != null)
                cb(nf);
		});        
    };
	$scope.openFile = function (f)  {
		var fn = $scope.data.root+$scope.data.cwd+f;
        $scope.openFilePath(fn);
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
    $scope.toolsSettings = function () {
    	var modalInstance = $modal.open({
 	     	templateUrl: 'views/tools.html',
 	     	controller: 'ToolsSettingsCtrl',
			resolve: {
				config:function() {return $scope.config;}
 	     	}
	    });

      	modalInstance.result.then(function (item) {
			$scope.config.go = item.go;
			$scope.config.goapp = item.goapp;
            $scope.config.apptype = item.apptype;
      	});
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
        if (rt.trim().length == 0) {
            $scope.data.rootpathentries = []
        } else {
		    $scope.data.rootpathentries = $scope.data.root.slice(1).split("/");
        }
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
        });
    	_editor.commands.addCommand({
			name: "fullBuild",
			bindKey: {win: "Ctrl-B", mac: "Command-B"},
			exec: function(editor) {
				$scope.build();
			}
        });
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
	$scope.showAnnotations = function (f, probs) {
		var fname = f.title;
        var annotations = [];
        angular.forEach(probs, function(p,i) {
            if (f.path == p.file) {
                this.push({
                   row:p.line-1,
                   column:p.column,
                   text:p.message,
                   type:"error"
                });
            }
        }, annotations);
        
        f.session.clearAnnotations();
        f.session.setAnnotations(annotations);
	};
    
    $scope.pushOutput = function (fl, data) {
        var output = data.buildoutput;
        var np = [];
        var packs = {};
        // index the output by the directory
        angular.forEach (data.builtDirectories, function (e) {
            this["/"+e] = e;
        }, packs);
        
        angular.forEach($scope.problems.errors, function(p,i) {
            // don't clear this error, if the server did not compile
            // this package/directory
            if (packs[p.directory] == null)
            //if (dirname != p.directory)
                this.push(p);
        }, np);
        angular.forEach(output, function(p, i) {
            this.push(p);
        }, np);
        $scope.problems.errors = np;    
    };
    $scope.jumpTo = function (msg) {
      $scope.openFilePath(msg.file, function (nf) {
        var pos = {row:msg.line,col:0};
        //$scope._aceEditor.moveCursorToPosition(pos);
        $scope._aceEditor.gotoLine(pos.row, 0, false);
        $scope._aceEditor.scrollToLine(pos.row, true, false, function() {});
        $scope._aceEditor.focus();
      });      
    };
    $scope.dirname = function(pt) {
      var parts = pt.split("/");
      return parts.slice(0,-1).join("/");
    };
    $scope.build = function () {
        var build = {build:true, buildtype:$scope.config.apptype, builder:$scope.config[$scope.config.apptype]};
        Workspaceservice.build (build).then (function (bres) {
            if (bres.data.ok) {
                $scope.pushOutput($scope.currentfile, bres.data);
                if ($scope.currentfile !== null)
                    $scope.showAnnotations($scope.currentfile, $scope.problems.errors);
            } else {
                $scope.addAlert(bres.data.message);
            }
        });        
    };
	Workspaceservice.loadConfig().then (function (d) {
        if (d.data.basedirectory === undefined) {
            d.data.basedirectory="";
        }
        $scope.config = d.data;
        $scope.setRoot($scope.config.basedirectory);
        $scope.build ();
        /*
        var build = {build:true, buildtype:$scope.config.apptype, builder:$scope.config[$scope.config.apptype]};
        Workspaceservice.build (build).then (function (bres) {
            if (bres.data.ok) {
                $scope.pushOutput($scope.currentfile, bres.data);
                if ($scope.currentfile !== null)
                    $scope.showAnnotations($scope.currentfile, $scope.problems.errors);
            } else {
                $scope.addAlert(bres.data.message);
            }
        });*/
		//$scope.chabs(0);
	});

    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
