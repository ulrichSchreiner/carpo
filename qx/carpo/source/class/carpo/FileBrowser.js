/**
 *
 * @asset(qx/icon/${qx.icontheme}/16/actions/*)
 */
qx.Class.define("carpo.FileBrowser", {
    extend : qx.ui.container.Composite,
    events : {
      "openFile"   : "qx.event.type.Data"
    },
    
    construct : function(app, workspace) {
      this.base(arguments);
      this._workspace = workspace;
      this._application = app;
      
      this._refreshLock = false;
      
      app.addListener("configChanged", this.configChanged, this);
      
      this.setLayout(new qx.ui.layout.VBox(2));
      this.setDecorator(null);
      this.setAllowGrowX(true);
      this.setAllowGrowY(true);
      
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(0);
      this.filter = new qx.ui.form.ComboBox();
      this.filter.addListener ("changeValue",this.filterChanged, this);
      toolbar.add (this.filter, {flex:1});
      toolbar.add(new qx.ui.toolbar.Separator());
      this.syncButton = new qx.ui.form.ToggleButton(null,"icon/16/actions/go-previous.png");
      toolbar.add(this.syncButton);
      this.syncButton.addListener ("changeValue", function (e) {
        if (e.getData()) {
          var cureditorpath = this._application.currentSelectedEditorPath();
          if (cureditorpath)
            this._selectNode(cureditorpath);
        }
        this._application.setConfigValue("browser.syncwitheditor", e.getData());
      }, this);
      this.add(toolbar);
      
      var root = {
        label: "Root",
        path : "/",
        children: [],
        filesystem : "",
        loaded:false
      };
      var model = qx.data.marshal.Json.createModel(root, true);
      this.tree = new qx.ui.tree.VirtualTree(model, "label", "children");
      
      var self = this;
      this.tree.setOpenMode("dbltap");
      this.tree.setHideRoot(true);
      this.tree.setDelegate(this.createTreeDelegate(function(d) {return true;}));
      this.tree.addListener ("open", function (e) {
        if (this._refreshLock) return;
        var node = e.getData();
        if (node.getDir())
          this.loadContent(node.getPath(), node);
      }, this);
      this.loadContent (model.getPath(), model);
      this.model = model;
      this._newFileCommand = new qx.ui.command.Command();
      this._newFileCommand.addListener("execute", this.newFile, this);
      this._newFolderCommand = new qx.ui.command.Command();
      this._newFolderCommand.addListener("execute", this.newFolder, this);
      this._removeFileCommand = new qx.ui.command.Command ();
      this._removeFileCommand.addListener("execute", this.removeFile, this);
      this._excludePackageCommand = new qx.ui.command.Command ();
      this._excludePackageCommand.addListener("execute", this.excludePackage, this);
      
      this.add(this.tree, {flex:1});
    },
    
    members : {
      createTreeDelegate : function (filterfunc) {
        return  {
          bindItem : this.bindTreeItem,
          onPool : this.poolTreeItem,
          configureItem:this.configureTreeItem,
          filter: filterfunc,
          app: this
        };        
      },
      getSelectedTreeNode : function () {
        var selection = this.tree.getSelection();
        var node = selection.getItem(0);
        return node;
      },
      
      selectNode : function (path) {
        if (!this.syncButton.getValue()) return;
        this._selectNode(path);
      },
      _selectNode : function (fpath) {
        this._refreshLock = true;
        var self = this;
        var path = "/"+fpath.fs+fpath.path;
        //var fs = fpath.fs;
        this._findNodesByPath(this.model, path.split("/").slice(1), function(mod) {
          self.tree.openNodeAndParents(mod);
          self.tree.getSelection().push(mod);
          self._refreshLock = false;          
        });
      },

      _findNodesByPath : function (mod, path, cb) {
        if (path.length === 0)
          cb(mod);
        else {
          var key = path.shift();
          var cn = this.findChildNode (mod, key);
          if (cn) {
            this._findNodesByPath(cn, path, cb);
          } else {
            var self = this;
            this.loadContent(mod.getPath(), mod, function (newparent) {
              var cn = self.findChildNode (newparent, key);
              if (cn)
                self._findNodesByPath(cn, path, cb);
              else
                cb(newparent);              
            });
          }
        }
      },
            
      findChildNode : function (parnode, childlbl) {
        var childs = parnode.getChildren().toArray();
        for (var i=0; i<childs.length; i++) {
          if (childs[i].getLabel() === childlbl) {
            return childs[i];
          }
        }
        return null;
      },
      
      configChanged : function (e) {
        var config = e.getData();  
        this.filter.removeAll();
        var self = this;
        config.browser.filterpatterns.forEach (function (f) {
            var it = new qx.ui.form.ListItem(f,null,f);
            self.filter.add(it);
        });
        this.filter.setValue(config.browser.currentfilter);
        if (config.browser.syncwitheditor)
          this.syncButton.setValue(config.browser.syncwitheditor);
      },
      
      filterChanged : function (e) {
        var selectedFilter = e.getData();
        var filter = function(node) {
            var label = node.getLabel();
            if (selectedFilter.trim() !== "")
                return new RegExp(selectedFilter).exec(label) === null;
            return true;
        };
        this.tree.setDelegate(this.createTreeDelegate(filter));
        this._application.setConfigValue("browser.currentfilter", selectedFilter);
      },
      configureTreeItem : function (item) {
        item.setContextMenu(this.app.getFileContextMenu());
      },
      bindTreeItem : function(controller, item, id) {
        controller.bindDefaultProperties(item, id);
        var mod = item.getModel();
        if (mod && !mod.getDir()) {
          var listenid = item.addListener("dbltap", function (e) {
            var selection = this.tree.getSelection();
            var node = selection.getItem(0);
            if (node && !node.getDir()) {
              this.fireDataEvent("openFile", node);
            }
          }, this.app);
          item.setUserData("filebrowserdblclick", listenid);
        }
      },
      poolTreeItem : function(item) {
        var listid = item.getUserData("filebrowserdblclick");
        if (listid) {
          item.removeListenerById(listid);
          item.setUserData("filebrowserdblclick",null);
        }
      },
      
      getFileContextMenu : function() {
        var menu = new qx.ui.menu.Menu();
        var newMenu = new qx.ui.menu.Menu();
        
        var newFile = new qx.ui.menu.Button("File", "icon/16/actions/document-new.png", this._newFileCommand);
        var newFolder = new qx.ui.menu.Button("Folder", "icon/16/actions/folder-new.png", this._newFolderCommand);

        newMenu.add(newFile);
        newMenu.add(newFolder);
        
        menu.add (new qx.ui.menu.Button("New", "icon/16/actions/document-new.png", null, newMenu));
        menu.add (new qx.ui.menu.Button("Delete", "icon/16/actions/edit-delete.png", this._removeFileCommand));
        menu.add (new qx.ui.menu.Button("Exclude from Build", null, this._excludePackageCommand));
  
        return menu;
      },
    
      loadContent : function (path, parnode, cb) {
        parnode.getChildren().removeAll();
        this._workspace.dir(parnode.getFilesystem(), path, function (data) {
          if (parnode.getFilesystem() !== "") {
            data.entries.sort(function (a,b) {
              if (a.dir && !b.dir) return -1;
              if (!a.dir && b.dir) return 1;
              var ta=a.name.toLowerCase(); 
              var tb=b.name.toLowerCase(); 
              return ta===tb?0:(ta<tb?-1:1);
            });
            data.entries.forEach (function (e) {
              if (e.dir) {
                parnode.getChildren().push(qx.data.marshal.Json.createModel({ filesystem:e.filesystem, dir:true, label:e.name, path:path+e.name+"/",children:[]}, true));
              } else {
                parnode.getChildren().push(qx.data.marshal.Json.createModel({ filesystem:e.filesystem, dir:false, label:e.name, path:path+e.name}, true));
              }
            });
          } else {
            data.entries.forEach (function (e) {
              parnode.getChildren().push(qx.data.marshal.Json.createModel({ filesystem:e.filesystem, dir:true, label:e.name, path:path,children:[]}, true));
            });
          }
          if (cb) {
            cb(parnode);
          }
        });
      },
      removeItem : function(root, item) {
        if (!root.getChildren || root == item) {
          return;
        }
        var children = root.getChildren();
        for (var i=0; i < children.length; i++) {
          if (children.getItem(i) == item) {
            children.remove(item);
            return;
          }
          this.removeItem(children.getItem(i), item);
        }
      },
    
      removeFile : function (evt) {
        var node = this.getSelectedTreeNode();
        var self = this;
        if (node) {
          var pt = node.getPath();
          if (confirm("Do you really want to delete '"+node.getFilesystem()+node.getPath()+"'?")) {
            self._workspace.rm(node.getFilesystem(), pt, function (cb) {
              self.removeItem(self.model, node);
            });
          }
        }            
      },
      
      newFolder : function (evt) {
        var node = this.getSelectedTreeNode();
        var self = this;
        if (node) {
          if (node.getDir()) {
            var pt = node.getPath();
            this._application.createModalTextInputDialog("Create Folder", "Create a new folder in '"+pt+"'", function (filename) {
              var path = pt+"/"+filename;
              self._workspace.createdir(node.getFilesystem(), path, function (cb) {
                 self.loadContent(pt, node, null);
              });
            });
          }
        }      
      },
      
      newFile : function (evt) {
        var node = this.getSelectedTreeNode();
        var self = this;
        if (node) {
          if (node.getDir()) {
            var pt = node.getPath();
            this._application.createModalTextInputDialog("Create File", "Create a new file in '"+pt+"'", function (filename) {
              var path = pt+"/"+filename;
              self._workspace.createfile(node.getFilesystem(), path, function (cb) {
                self.loadContent(pt, node, null);
              });
            });
          }
        }
      },
      
      excludePackage : function (evt) {
        var node = this.getSelectedTreeNode();
        var self = this;
        if (node) {
          var pt = node.getPath();
          var sub = "/src/";
          if (pt.substring(0,sub.length) === sub) {
            var pkg = pt.substring(sub.length);
            if (!node.getDir()) {
              pkg = pkg.split("/").slice(0,-1).join("/");
            }
            if (pkg[pkg.length-1] === "/")
              pkg = pkg.substring(0, pkg.length-1);
            var config = this._application.getConfig();
            this._application.addImportPathToIgnoreList(config, pkg);
            this._application.saveConfig();
            this._application.refreshIgnoredResources();
          }
        }
      }
    }
});
