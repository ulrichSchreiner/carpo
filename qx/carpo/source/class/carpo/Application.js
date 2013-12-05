/* ************************************************************************

   Copyright:

   License:

   Authors:

************************************************************************ */

/**
 * This is the main application class of your custom application "carpo"
 *
 * @asset(carpo/*)
 * @asset(qx/icon/${qx.icontheme}/16/actions/*)
 */
qx.Class.define("carpo.Application",
{
  extend : qx.application.Standalone,



  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members :
  {
    /**
     * This method contains the initial application code and gets called 
     * during startup of the application
     * 
     * @lint ignoreDeprecated(alert)
     */
    main : function() {
        // Call super class
        this.base(arguments);
        
        // Enable logging in debug variant
        if (qx.core.Environment.get("qx.debug")) {
            // support native logging capabilities, e.g. Firebug for Firefox
            qx.log.appender.Native;
            // support additional cross-browser console. Press F7 to toggle visibility
            qx.log.appender.Console;
        }
        this.workspace = new carpo.Workspace();
        carpo.EditorsPane.loadAce(qx.lang.Function.bind(this.init, this));
    },

    init : function () {
        var app = this;
        this.createCommands ();
        var container = new qx.ui.container.Composite(new qx.ui.layout.VBox(2)).set({
            decorator: "main",
            allowGrowY: true,
            allowGrowX: true
        });
        container.add(this.getMenuBar(),{flex:0});
      
        var pane = new qx.ui.splitpane.Pane("horizontal").set({
            allowGrowY: true,
            allowGrowX: true
        });
        var pane2 = new qx.ui.splitpane.Pane("vertical").set({
            allowGrowY: true,
            allowGrowX: true
        });
        this.compileroutputModel = new qx.ui.table.model.Simple();
        this.compileroutputModel.setColumns([ "Source", "Line", "Message" ]);
        var custom = {
            tableColumnModel : function(obj) {
                return new qx.ui.table.columnmodel.Resize(obj);
            }
        };      
        this.compileroutput = new qx.ui.table.Table(this.compileroutputModel, custom)
            .set({
                allowGrowX:true,
                allowGrowY:true,
                decorator:null,
                statusBarVisible:false
                });
        this.compileroutput.addListener("cellDblclick", function (e) {
            var row = e.getRow();
            var data = this.compileroutputModel.getRowData(row);
            this.showError (data[0], data[1], data[2]);
        }, this);
        var tcm = this.compileroutput.getTableColumnModel();

        var resizeBehavior = tcm.getBehavior();

        resizeBehavior.setWidth(0, "20%");
        resizeBehavior.setWidth(1, "10%");
        resizeBehavior.setWidth(2, "70%");
        
        this.editors = new carpo.EditorsPane(null);
        this.editors.setDecorator("main");
        this.editors.setAllowGrowX(true);
        this.editors.setAllowGrowY(true);
        
        var browser = new qx.ui.container.Composite(new qx.ui.layout.VBox(2))
            .set({decorator:null,allowGrowX:true,allowGrowY:true});
        var toolbar = new qx.ui.toolbar.ToolBar();
        toolbar.setSpacing(0);
        this.browserfilter = new qx.ui.form.ComboBox();
        this.browserfilter.addListener ("changeValue", function (e) {
            var selectedFilter = e.getData();
            this.getConfig().browser.currentfilter = selectedFilter;
            var filter = qx.lang.Function.bind(function(node) {
                var label = node.label;
                if (selectedFilter.trim() !== "")
                    return new RegExp(selectedFilter).exec(label) === null;
                return true;
            }, this);
            dm.setFilter(filter);      
            this.saveConfig();
        }, this);
        toolbar.add (this.browserfilter, {flex:1});
        toolbar.add(new qx.ui.toolbar.Separator());
        var syncButton = new qx.ui.form.ToggleButton(null,"icon/16/actions/go-previous.png");
        toolbar.add(syncButton);
        browser.add(toolbar);
        
        var tree = new qx.ui.treevirtual.TreeVirtual("Workspace");
        //tree.setColumnWidth(0, 400);
        tree.setAlwaysShowOpenCloseSymbol(true);
        tree.setDecorator("main");
        tree.setAllowGrowX(true);
        tree.setStatusBarVisible(false);
        
        var dm = tree.getDataModel();
        tree.addListener("cellClick", function(ce) {
            var node = dm.getNode(ce.getRow());
            if (node.type == qx.ui.treevirtual.MTreePrimitive.Type.LEAF) {
                var pt = this.filepathFromNode(tree, node);
                this.workspace.loadFile (pt, function (data) {
                    app.editors.openEditor(pt, node.label, data.content, data.filemode);     
                    app.showAnnotations();
                });
            } else {
                dm.setState(node, {bOpened:!node.bOpened});
            }
        }, this);
        tree.addListener("treeOpenWithContent", function(e) {
            var node = e.getData();
            var pt = this.filepathFromNode(tree, node);
            this.buildTreeNodes(dm, node.nodeId, pt);
        }, this);
        tree.addListener("treeOpenWhileEmpty", function(e) {
            var node = e.getData();
            var pt = this.filepathFromNode(tree, node);
            this.buildTreeNodes(dm, node.nodeId, pt);         
        }, this);
        this.editors.addListener ("fileSelected", function(e) {
          var path = e.getData().path;
          console.log(dm.getData());
        }, this);
      
        browser.add(tree,{flex:1});
        pane.add(browser,1);
        pane2.add(this.editors,4);
        pane2.add(this.compileroutput, 1);
        pane.add(pane2,4);
        container.add(pane, {flex:1});
        this.getRoot().add(container, {width:"100%", height:"100%"});
        
        this.buildTreeNodes (dm, null, "/");
        this._configuration = {};
        this.refreshConfig(function (config) {
            if (config.settings && config.settings.editor)
                app.editors.configChanged(config.settings.editor);
            app.browserfilter.removeAll();
            config.browser.filterpatterns.forEach (function (f) {
                var it = new qx.ui.form.ListItem(f,null,f);
                app.browserfilter.add(it);
            });
            app.browserfilter.setValue(config.browser.currentfilter);
            app.build();
        });
    },
    filepathFromNode : function (tree, node) {
        var h = tree.getHierarchy(node.nodeId);
        var pt = h.reduce(function (prev,cur) {
            return prev+cur+"/";
        },"/");
        return pt.slice(0,-1);
    },
    
    buildTreeNodes : function (treemodel, parnode, path) {
        this.workspace.dir(path, function (data) {
            if (parnode) {
                treemodel.prune(parnode, false);
            }
            if (!data || !data.entries)
                return;
            data.entries.sort(function(a,b) {
                return a.name.localeCompare(b.name);
            }).forEach(function (el, idx) {
            if (el.dir) {
                treemodel.addBranch(parnode,el.name, false);
            } else {
                treemodel.addLeaf(parnode, el.name);
            }
          });
          treemodel.setData();
      });     
    },
    refreshConfig : function (cb) {
        var app = this;
        this.workspace.loadconfig (function (data) {
            // config data is a pure string ...
            app._configuration = qx.lang.Json.parse(data);
            app._generateDefaultConfig(app._configuration);
            cb(app._configuration);
        }, function () {
            app._configuration = {};
            app._generateDefaultConfig(app._configuration);
            cb(app._configuration);
        });
    },
    _generateDefaultConfig : function (config) {
        if (!config.settings)
            config.settings = carpo.Settings.getSettings(null);
        if (!config.browser) {
            config.browser = {};
            config.browser.filterpatterns = ["^\\..*","pkg|bin|^\\..*"];
            config.browser.currentfilter = config.browser.filterpatterns[1];
        }        
    },
    
    saveConfig : function (cb) {
        var app = this;
        this.workspace.saveconfig (this._configuration, function (data) {
            if (cb)
                cb(app._configuration);
        });
        
    },
    getConfig : function ()  {
        return this._configuration;
    },
    
    createCommands : function () {
        this._saveCommand = new qx.ui.core.Command("Ctrl+S");
        this._saveCommand.addListener("execute", this.saveFile, this);
        this._settingsCommand = new qx.ui.core.Command();
        this._settingsCommand.addListener("execute", this.showSettings, this);
        this._buildCommand = new qx.ui.core.Command("Ctrl-B");
        this._buildCommand.addListener("execute", this.build, this);
    },
    
    getMenuBar : function() {
        var frame = new qx.ui.container.Composite(new qx.ui.layout.Grow());
        
        var menubar = new qx.ui.menubar.MenuBar();
        //menubar.setWidth(600);
        frame.add(menubar);
        
        var fileMenu = new qx.ui.menubar.Button("File", null, this.getFileMenu());
        var viewMenu = new qx.ui.menubar.Button("View", null, this.getViewMenu());
        //var editMenu = new qx.ui.menubar.Button("Edit", null, this.getEditMenu());
        //var searchMenu = new qx.ui.menubar.Button("Search", null, this.getSearchMenu());
        //var viewMenu = new qx.ui.menubar.Button("View", null, this.getViewMenu());
        //var formatMenu = new qx.ui.menubar.Button("Format", null, this.getFormatMenu());
        //var helpMenu = new qx.ui.menubar.Button("Help", null, this.getHelpMenu());
        
        menubar.add(fileMenu);
        menubar.add(viewMenu);
        
        //menubar.add(editMenu);
        //menubar.add(searchMenu);
        //menubar.add(viewMenu);
        //menubar.add(formatMenu);
        //menubar.add(helpMenu);
        
        return frame;
    },

    getViewMenu : function () {
        var menu = new qx.ui.menu.Menu();
        var settings = new qx.ui.menu.Button("Settings",null, this._settingsCommand);
        menu.add(settings);
        return menu;
    },
    getFileMenu : function() {
        var menu = new qx.ui.menu.Menu();
        
        //var newButton = new qx.ui.menu.Button("New", "icon/16/actions/document-new.png", this._newCommand);
        //var openButton = new qx.ui.menu.Button("Open", "icon/16/actions/document-open.png", this._openCommand);
        //var closeButton = new qx.ui.menu.Button("Close");
        var saveButton = new qx.ui.menu.Button("Save", "icon/16/actions/document-save.png", this._saveCommand);
        //var saveAsButton = new qx.ui.menu.Button("Save as...", "icon/16/actions/document-save-as.png");
        //var printButton = new qx.ui.menu.Button("Print", "icon/16/actions/document-print.png");
        //var exitButton = new qx.ui.menu.Button("Exit", "icon/16/actions/application-exit.png");
        
        //newButton.addListener("execute", this.debugButton);
        //openButton.addListener("execute", this.debugButton);
        //closeButton.addListener("execute", this.debugButton);
        //saveButton.addListener("execute", this.debugButton);
        //saveAsButton.addListener("execute", this.debugButton);
        //printButton.addListener("execute", this.debugButton);
        //exitButton.addListener("execute", this.debugButton);
        
        //menu.add(newButton);
        //menu.add(openButton);
        //menu.add(closeButton);
        menu.add(saveButton);
        //menu.add(saveAsButton);
        //menu.add(printButton);
        //menu.add(exitButton);
        
        return menu;
    },
    
    saveFile : function (evt) {
        var editor = this.editors.getCurrentEditor ();
        var config = this.getConfig();
        if (editor) {
            var app = this;
            var data = editor.getEditorData();
            data.build = true;
            var builder = config.settings.go.apptype;
            if (builder) {
                data.buildtype = builder;
                data.builder = config.settings.go[builder+"_path"];
            }
            this.workspace.saveFile(data.path, data, function (rsp) {
              editor.setEditorValue(rsp.formattedcontent, true);
              app.showBuildResult(rsp);
            });
        }
    },
    
    build : function (evt) {
        var config = this.getConfig();
        var data = {};
        data.build = true;
        var builder = config.settings.go.apptype;
        if (builder) {
            data.buildtype = builder;
            data.builder = config.settings.go[builder+"_path"];
        }
        var app = this;
        this.workspace.build(data, function (rsp) {
            app.showBuildResult(rsp);
        });
    },
    showBuildResult : function (result) {
        var data = [];
        if (result && result.buildoutput) {
          this.currentBuildoutput = result.buildoutput;
          result.buildoutput.forEach(function (o) {
             data.push([o.file,o.line,o.message]); 
          });
        } else {
          this.currentBuildoutput = null;
        }
        this.showAnnotations();
        this.compileroutputModel.setData(data);
    },
    showAnnotations : function () {
      this.editors.showAnnotations(this.currentBuildoutput || []);
    },
    showError : function (src, line, message) {
        var app = this;
        var editor = this.editors.getEditorFor(src);
        if (!editor) {
            this.workspace.loadFile (src, function (data) {
                app.editors.openEditor(src, data.title, data.content, data.filemode);                 
                app.showAnnotations();
            });  
        } else {
          this.editors.showEditor(editor);
        }
    },
    showSettings : function(evt) {
        var s = new carpo.Settings(this.getConfig().settings);
        s.setModal(true);
        s.moveTo(100,100);
        s.open();
        s.addListener("ok", function (e) {
            var app = this;
            app.getConfig().settings = e.getData();
            this.saveConfig (function () {
                app.editors.configChanged(app.getConfig().settings.editor);    
            });            
        }, this);
        this.getRoot().add(s);
    },
    
    debugButton : function (event) {
        this.debug("Execute button: " + this.getLabel());
    }

  }
});
