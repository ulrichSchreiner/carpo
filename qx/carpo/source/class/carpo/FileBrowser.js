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
          this._selectNode(this._application.currentSelectedEditorPath());      
        }
      }, this);
      this.add(toolbar);
      
      var root = {
        label: "Root",
        path : "/",
        children: [],
        loaded:false
      };
      var model = qx.data.marshal.Json.createModel(root, true);
      this.tree = new qx.ui.tree.VirtualTree(model, "label", "children");
      
      var self = this;
      this.tree.setOpenMode("click");
      this.tree.setHideRoot(true);
      this.tree.setDelegate({configureItem:this.configureTreeItem,filter: function(d) {return true;}});
      this.tree.addListener ("open", function (e) {
        if (this._refreshLock) return;
        var node = e.getData();
        if (node.getDir())
          this.loadContent(node.getPath(), node);
      }, this);
      this.tree.getSelection().addListener("change", function (e) {
        var selection = this.tree.getSelection();
        var node = selection.getItem(0);
        if (node && !node.getDir()) {
          this.fireDataEvent("openFile", node);
        }
      },this);
      this.loadContent (model.getPath(), model);
      this.model = model;
      this._newFileCommand = new qx.ui.core.Command();
      this._newFileCommand.addListener("execute", this.newFile, this);
      this._newFolderCommand = new qx.ui.core.Command();
      this._newFolderCommand.addListener("execute", this.newFolder, this);
      this._removeFileCommand = new qx.ui.core.Command ();
      this._removeFileCommand.addListener("execute", this.removeFile, this);
      
      this.add(this.tree, {flex:1});
    },
    
    members : {
      getSelectedTreeNode : function () {
        var selection = this.tree.getSelection();
        var node = selection.getItem(0);
        return node;
      },
      
      selectNode : function (path) {
        if (!this.syncButton.getValue()) return;
        this._selectNode(path);
      },
      _selectNode : function (path) {
        this._refreshLock = true;
        var selection = this._findNodesByPath(path);
        this.tree.getSelection().push(selection[selection.length-1]);
        this._refreshLock = false;
      },
      
      _findNodesByPath : function (pt) {
        var parts = pt.split("/");
        var mod = this.model;
        var self = this;
        var res = [mod];      
        parts.forEach(function (p) {
          var cn = self.findChildNode(mod, p);
          if (cn) {
            mod = cn;
            if (mod.getDir() && !self.tree.isNodeOpen(cn)) {
              self.tree.openNode(cn);
            }
            res.push(mod);
          }
        });
        return res;
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
      },
      
      filterChanged : function (e) {
        var selectedFilter = e.getData();
        var filter = function(node) {
            var label = node.getLabel();
            if (selectedFilter.trim() !== "")
                return new RegExp(selectedFilter).exec(label) === null;
            return true;
        };
        this.tree.setDelegate({filter: filter, configureItem:this.configureTreeItem,app:this});
        this._application.setConfigValue("browser.currentfilter", selectedFilter);
      },
      configureTreeItem : function (item) {
        item.setContextMenu(this.app.getFileContextMenu());
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
  
        return menu;
      },
    
      loadContent : function (path, parnode, cb) {
        parnode.getChildren().removeAll();
        this._workspace.dir(path, function (data) {
          data.entries.forEach (function (e) {
            if (e.dir) {
              parnode.getChildren().push(qx.data.marshal.Json.createModel({ dir:true, label:e.name, path:path+e.name+"/",children:[]}, true));
            } else {
              parnode.getChildren().push(qx.data.marshal.Json.createModel({ dir:false, label:e.name, path:path+e.name}, true));
            }
          });
          if (cb) {
            cb(parnode);
          }
        });
      },
      removeFile : function (evt) {
        var node = this.getSelectedTreeNode();
        var self = this;
        if (node) {
          var pt = node.getPath();
          self._workspace.rm(pt, function (cb) {
            console.log("element deleted",cb);
          });
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
              self._workspace.createdir(path, function (cb) {
                console.log("file created",cb);
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
              self._workspace.createfile(path, function (cb) {
                console.log("file created",cb);
              });
            });
          }
        }
      }
    }
});
