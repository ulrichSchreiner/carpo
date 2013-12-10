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
        var self = this;
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
          self._workspace.rm(pt, function (cb) {
            self.removeItem(self.model, node);
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
              self._workspace.createfile(path, function (cb) {
                self.loadContent(pt, node, null);
              });
            });
          }
        }
      }
    }
});
