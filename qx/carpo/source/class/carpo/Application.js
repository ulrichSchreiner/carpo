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
 * @asset(qx/icon/${qx.icontheme}/16/status/*)
 * @asset(qx/icon/${qx.icontheme}/32/status/*)
 */
qx.Class.define("carpo.Application",
{
  extend : qx.application.Standalone,
  events : {
    "configChanged"   : "qx.event.type.Data"
  },


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
        qx.Class.include(qx.ui.table.Table, qx.ui.table.MTableContextMenu);
        qx.Class.include(qx.ui.tree.VirtualTreeItem,qx.ui.form.MModelProperty);
        
        // Enable logging in debug variant
        if (qx.core.Environment.get("qx.debug")) {
            // support native logging capabilities, e.g. Firebug for Firefox
            qx.log.appender.Native;
            // support additional cross-browser console. Press F7 to toggle visibility
            qx.log.appender.Console;
        }
        this.workspace = new carpo.Workspace(this);
        this.debugger = new carpo.Debugger(this);
        carpo.EditorsPane.loadAce(qx.lang.Function.bind(this.init, this));
    },

    init : function () {
        var app = this;
        this.createCommands ();
        var container = new qx.ui.container.Composite(new qx.ui.layout.VBox(2)).set({
            decorator: null,
            allowGrowY: true,
            allowGrowX: true
        });
        container.add(this.getMenuBar(),{flex:0});
        container.add(this.getToolbar(),{flex:0});
      
        var pane = new qx.ui.splitpane.Pane("horizontal").set({
            allowGrowY: true,
            allowGrowX: true
        });
        var pane2 = new qx.ui.splitpane.Pane("vertical").set({
            allowGrowY: true,
            allowGrowX: true
        });
        this.compileroutputModel = new qx.ui.table.model.Simple();
        var columns = [ "","Project","Source", "Line", "Column","Message" ];
        this.compileroutputModel.setColumns(columns);
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
        this.compileroutput.getSelectionModel().setSelectionMode(qx.ui.table.selection.Model.SINGLE_INTERVAL_SELECTION);                
        for (var i=0; i<columns.length; i++)
          this.compileroutput.setContextMenuHandler(i, this.problemContextMenu, this);
        this.compileroutput.addListener("cellDblclick", function (e) {
            var row = e.getRow();
            var data = this.compileroutputModel.getRowData(row);
            this.showError (data[1], data[2], data[3], data[4], data[5]);
        }, this);
        var tcm = this.compileroutput.getTableColumnModel();
      
        var resizeBehavior = tcm.getBehavior();

        resizeBehavior.setWidth(0, "2%");
        resizeBehavior.setWidth(1, "5%");
        resizeBehavior.setWidth(2, "20%");
        resizeBehavior.setWidth(3, "4%");
        resizeBehavior.setWidth(4, "4%");
        resizeBehavior.setWidth(5, "65%");

        var renderer = new qx.ui.table.cellrenderer.Image();
        this.compileroutput.getTableColumnModel().setDataCellRenderer(0, renderer);
        
        this.editors = new carpo.EditorsPane(this, this.workspace, null);
        this.editors.setDecorator("main");
        this.editors.setAllowGrowX(true);
        this.editors.setAllowGrowY(true);
        
        var fb = new carpo.FileBrowser(this, this.workspace);
        fb.addListener ("openFile", function (e) {
          var path = e.getData().getPath();
          var lbl = e.getData().getLabel();
          var fs = e.getData().getFilesystem();
          this.workspace.loadFile (fs, path, function (data) {
              app.editors.openEditor(fs, path, lbl, data.content, data.filemode);     
              app.showAnnotations();
          });          
        }, this);

        this.editors.addListener ("fileSelected", function(e) {
          var path = e.getData().path;
          var fs = e.getData().filesystem;
          fb.selectNode({path:path,fs:fs});
        }, this);

        var output = new qx.ui.tabview.TabView();
        output.setContentPadding(0,0,0,0);
        var problems = new qx.ui.tabview.Page("Problems");
        problems.setLayout(new qx.ui.layout.HBox(0));
        output.add(problems);
        problems.add(this.compileroutput,{flex:1});
        this.problems = problems;
        
        var runoutput = new qx.ui.tabview.Page("Run/Debug Console");
        var console = new qx.ui.container.Composite(new qx.ui.layout.VBox(0));
        var outputpanel = new qx.ui.splitpane.Pane("horizontal").set({
            allowGrowY: true,
            allowGrowX: true
        });
        
        runoutput.setLayout(new qx.ui.layout.VBox(0));
        this.txtRunoutput = new qx.ui.form.TextArea("");
        this.txtRunoutput.setReadOnly(true);
        this.txtRunoutput.addListener ("changeValue", function (e) {          
          var el = this.txtRunoutput.getContentElement().getDomElement();
          if (el)
            el.scrollTop = el.scrollHeight;
        }, this);
        outputpanel.add(console,2);
        this.debugpanel = new carpo.DebugPanel(this.debugger, this, this.workspace);
        console.add (this.getRunningToolbar(this.txtRunoutput),{flex:0});
        console.add (this.txtRunoutput,{flex:1});
        
        outputpanel.add (this.debugpanel,1);
        runoutput.add (outputpanel, {flex:1});
        //runoutput.add (this.debugpanel, {flex:1});
        
        output.add(runoutput);
        
        var ignoredPackages = new qx.ui.tabview.Page("Ignored Resources");
        ignoredPackages.setLayout(new qx.ui.layout.HBox(0));
        this.ignoredPackagesModel = new qx.ui.table.model.Simple();
        this.ignoredPackagesModel.setColumns([ "Type","Ignored" ]);
        custom = {
            tableColumnModel : function(obj) {
                return new qx.ui.table.columnmodel.Resize(obj);
            }
        };      
        this.ignoredPackagesTable = new qx.ui.table.Table(this.ignoredPackagesModel, custom)
            .set({
                allowGrowX:true,
                allowGrowY:true,
                decorator:null,
                statusBarVisible:false
                });
        this.ignoredPackagesTable.getSelectionModel().setSelectionMode(qx.ui.table.selection.Model.SINGLE_INTERVAL_SELECTION);
        this.ignoredPackagesTable.setContextMenuHandler(0, this.ignoredPackagesContextMenu, this);
        tcm = this.ignoredPackagesTable.getTableColumnModel();
        resizeBehavior = tcm.getBehavior();
        resizeBehavior.setWidth(0, "30%");
        resizeBehavior.setWidth(1, "70%");
        ignoredPackages.add(this.ignoredPackagesTable,{flex:1});
        output.add(ignoredPackages);
        pane.add(fb, 1);
        pane2.add(this.editors,2);
        pane2.add(output, 1);
        pane2.setDecorator(null);
        pane.add(pane2,4);
        container.add(pane, {flex:1});
        this.getRoot().add(container, {width:"100%", height:"100%"});
        
        this._configuration = {};
        this.refreshConfig(function (config) {
          app.updaterunconfigsInToolbar(config);

          if (config.settings && config.settings.editor)
            app.editors.configChanged(config.settings.editor);
          app.refreshIgnoredResources();
          var name = config.name;
          if (name[name.length-1]==="/") 
            name = name.substring(0, name.length-1);
          document.title = "Carpo ["+name.split("/").splice(-1)+"]";

          app.updateEnvironment (function (env) {
            if (env.gocode && env.gocode.path)
              app._installGocode.setEnabled(false);
          });

          app.build();
        });
    },
    showStatusMessage : function (msg, pending) {
      if (pending)
        this.status.setValue("<i>"+msg+"</i>");
      else
        this.status.setValue("<b>"+msg+"</b>");
    },
    
    ignoredPackagesContextMenu : function (col, row, table, dataModel, contextMenu) {
      var config = this.getConfig();
      var me = new qx.ui.menu.Button ("Build packages");
      me.addListener("execute", function (e) {
        table.getSelectionModel().iterateSelection(function(ind) {
          var data = dataModel.getValue(1, ind);
          delete (config.ignoredPackages[data]);
        });
        this.saveConfig();
        this.refreshIgnoredResources();        
      }, this);
      contextMenu.add(me);
      return true;      
    },
    
    problemContextMenu : function (col, row, table, dataModel, contextMenu) {
      var config = this.getConfig();
      var me = new qx.ui.menu.Button ("Ignore packages when building");
      me.addListener("execute", function (e) {
        table.getSelectionModel().iterateSelection(function(ind) {
          var dat = dataModel.getValue(9, ind);
          if (!config.ignoredPackages[dat.packageimportpath]) {
            config.ignoredPackages[dat.packageimportpath] = {};
          }
        });
        
        this.saveConfig();
        this.refreshIgnoredResources();
      }, this);
      contextMenu.add(me);
      var re = /cannot find package \"(.*?)\" .*/;
      var dat = dataModel.getValue(9,row);
      var ok = re.exec(dat.message);
      if (ok) {
        me = new qx.ui.menu.Button ("Install '"+ok[1]+"'");
        me.addListener("execute", function (e) {
          this.workspace.installPackage(ok[1], function () {
            alert ("Package '"+ok[1]+" installed. Please rebuild (STRG+B).");
          });
        }, this);
        contextMenu.add(me);
      }
      return true;      
    },
    refreshIgnoredResources : function () {
      var d = [];
      var config = this.getConfig();
      for (var i in config.ignoredPackages) {
        d.push(["Package",i]);
      }
      this.ignoredPackagesModel.setData(d);      
    },
    currentSelectedEditorPath : function () {
      var ed = this.editors.getCurrentEditor();
      if (ed)
        return {path: ed.getFilepath(), fs: ed.getFilesystem()};
      return null;
    },
    
    refreshConfig : function (cb) {
        var app = this;
        this.workspace.loadconfig (function (data) {
            // config data is a pure string ...
            app._configuration = qx.lang.Json.parse(data);
            app._generateDefaultConfig(app._configuration);
            app.debugger.setConfig(app._configuration);
            cb(app._configuration);
            app.fireDataEvent("configChanged", app._configuration);
        }, function () {
            app._configuration = {};
            app._generateDefaultConfig(app._configuration);
            app.debugger.setConfig(app._configuration);
            cb(app._configuration);
            app.fireDataEvent("configChanged", app._configuration);
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
        if (!config.runconfig) {
          config.runconfig = {};
          config.runconfig.configs = {};
        }
        if (!config.ignoredPackages) {
          config.ignoredPackages = {};
        }
        if (!config.markers) {
          config.markers = [];
        }
        if (!config.debugger) config.debugger={};
        if (!config.debugger.breakpoints) {
          config.debugger.breakpoints = {};
        }
    },
    setConfigValue : function (key, val) {
      this._setConfigValue (key, val);
      this.saveConfig();
    },
    _setConfigValue : function (key, val) {
      var keys = key.split(".");
      var target = this.getConfig();
      for (var i=0; i<keys.length-1; i++) {
        if (!(keys[i] in target))
          target[keys[i]] = {};
        target = target[keys[i]];
      }
      target[keys[keys.length-1]] = val;
    },
    setConfigValues : function (overlay) {
      for (var k in overlay) {
        var val = overlay[k];
        this._setConfigValue(k, val);
      }
      this.saveConfig();
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
        this._exitCommand = new qx.ui.core.Command("Ctrl-Q");
        this._exitCommand.addListener("execute", this.exit, this);
        this._runCommand = new qx.ui.core.Command("Ctrl-R");
        this._runCommand.addListener("execute", this.run, this);
        this._saveAllCommand = new qx.ui.core.Command();
        this._saveAllCommand.addListener("execute", this.saveAll, this);
        this._installGocode = new qx.ui.core.Command();
        this._installGocode.addListener("execute", this.installGocode, this);
        this._addImport = new qx.ui.core.Command("Ctrl-Shift-M");
        this._addImport.addListener("execute", this.addImport, this);
        this._addPackage = new qx.ui.core.Command("Ctrl-Shift-J");
        this._addPackage.addListener("execute", this.addPackage, this);
    },
    getRunningToolbar : function (output) {
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(0);
      toolbar.setDecorator(null);
      toolbar.setPaddingLeft(10);
      this.processes = new qx.data.Array();
      var processes = new qx.ui.form.SelectBox();
      processes.setMinWidth(250);
      this.processList = processes;
      var ctrl = new qx.data.controller.List(this.processes, processes, "name");
      //processes.addListener ("changeSelection",this.processChanged, this);
      toolbar.add (processes, {flex:0});
      var stopButton = new qx.ui.form.Button(null,"icon/16/actions/process-stop.png");
      this.processes.bind("length", stopButton, "enabled", {
        converter : function (l) {
          return l>0;
        }
      });
      ctrl.bind("selection[0].output", output, "value");
      ctrl.bind("selection[0]", this.debugpanel, "currentSession");
      /*ctrl.getSelection().addListener ("change", function (e) {
        var d = e.getData();
        if (d.type === "add")
          this.debugpanel.setCurrentSession(d.added[0].getSession());
        else if (d.type === "remove")
          this.debugpanel.setCurrentSession(null);
        //console.log(e.getData());
      }, this);*/
      //ctrl.bind("selection[0]", this.debugpanel, "currentSession");
      
      stopButton.addListener ("execute", function (e) {
        var sel = processes.getSelection()[0];
        if (sel) sel = sel.getModel();
        if (sel) {
          if (sel.getPid() !== "")
            this.workspace.killproc(sel.getPid());
          else
            this.processes.remove(sel);
        }        
      }, this);
      toolbar.add(stopButton);
      stopButton.setEnabled(false);
      return toolbar;
    },
    
    getToolbar : function () {
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(0);
      toolbar.setDecorator(null);
      toolbar.setPaddingLeft(10);
      this.runconfigs = new qx.ui.form.SelectBox();
      this.runconfigs.addListener ("changeSelection",this.runconfigChanged, this);
      toolbar.add (this.runconfigs, {flex:0});
      this.runconfigdata = new qx.data.Array();
      var menu = new qx.ui.menu.Menu();

      new qx.data.controller.List (this.runconfigdata, this.runconfigs, "name");
      var newConfig = new qx.ui.menu.Button("Run Configurations ...");
      newConfig.addListener("execute", function(e) {
        var runconfigs = new carpo.RunConfiguration(this.getConfig());
        runconfigs.addListener("ok", this.runconfigsChanged, this);
        runconfigs.center();
        runconfigs.show();        
      }, this);
      menu.add(newConfig);
      
      this.debugButton = new qx.ui.form.Button(null,"carpo/Debug-Bug-2-icon.png");
      toolbar.add(this.debugButton);
      this.debugButton.addListener("execute", this.debug, this);
      this.runButton = new qx.ui.form.SplitButton(null,"icon/16/actions/go-next.png", menu);
      toolbar.add(this.runButton);
      this.runButton.addListener ("execute", this.run, this);
      toolbar.addSpacer();
      this.status = new qx.ui.basic.Label ();
      this.status.setRich(true);
      this.status.setPadding(5);
      toolbar.add(this.status);
      this.showStatusMessage ("Ready!", false);
      return toolbar;
    },
    
    runconfigChanged : function (e) {
      var config =this.getConfig();
      if (config && config.runconfig) {
        var sel = this.runconfigs.getSelection()[0];
        if (sel) sel = sel.getModel();
        if (sel) {
          this.getConfig().runconfig.current = sel.getId();
          this.saveConfig();
        }
      }
    },
    runconfigsChanged : function (e) {
      var runconfigs = e.getData();
      var config = this.getConfig();
      config.runconfig.configs = runconfigs;
      this.saveConfig();
      this.updaterunconfigsInToolbar(config);
    },
    
    updaterunconfigsInToolbar : function (config) {
      var app = this;
      var current = null;
      var id = config.runconfig.current;
      app.runconfigdata.removeAll();
      for (var c in config.runconfig.configs) {
        var conf = config.runconfig.configs[c];
        var d = qx.data.marshal.Json.createModel(conf);
        if (id == conf.id)
          current = d;
        app.runconfigdata.push(d);
      }
      if (current)
        this.runconfigs.setModelSelection([current]);
    },
    
    getMenuBar : function() {
        var frame = new qx.ui.container.Composite(new qx.ui.layout.Grow());
        frame.setDecorator (null);
        var menubar = new qx.ui.menubar.MenuBar();
        frame.add(menubar);
        
        var fileMenu = new qx.ui.menubar.Button("File", null, this.getFileMenu());
        var viewMenu = new qx.ui.menubar.Button("View", null, this.getViewMenu());
        var toolsMenu= new qx.ui.menubar.Button("Tools", null, this.getToolsMenu());
        var sourceMenu= new qx.ui.menubar.Button("Source", null, this.getSourceMenu());
        
        //var editMenu = new qx.ui.menubar.Button("Edit", null, this.getEditMenu());
        //var searchMenu = new qx.ui.menubar.Button("Search", null, this.getSearchMenu());
        //var viewMenu = new qx.ui.menubar.Button("View", null, this.getViewMenu());
        //var formatMenu = new qx.ui.menubar.Button("Format", null, this.getFormatMenu());
        //var helpMenu = new qx.ui.menubar.Button("Help", null, this.getHelpMenu());
        
        menubar.add(fileMenu);
        menubar.add(viewMenu);
        menubar.add(toolsMenu);
        menubar.add(sourceMenu);
        
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
        var saveAllButton = new qx.ui.menu.Button ("Save all", null, this._saveAllCommand);
        //var saveAsButton = new qx.ui.menu.Button("Save as...", "icon/16/actions/document-save-as.png");
        //var printButton = new qx.ui.menu.Button("Print", "icon/16/actions/document-print.png");
        var exitButton = new qx.ui.menu.Button("Exit", "icon/16/actions/application-exit.png", this._exitCommand);
        
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
        menu.add(saveAllButton);
        //menu.add(saveAsButton);
        //menu.add(printButton);
        menu.add(exitButton);
        
        return menu;
    },
    
    getToolsMenu : function () {
      var menu = new qx.ui.menu.Menu ();
      
      var installgocode = new qx.ui.menu.Button ("Install autocomplete (gocode)", null, this._installGocode);
      menu.add (installgocode);
      
      return menu;
    },
    getSourceMenu : function () {
      var menu = new qx.ui.menu.Menu ();
      
      var addimport = new qx.ui.menu.Button ("Add import", null, this._addImport);
      var addpackage = new qx.ui.menu.Button("Install package",null, this._addPackage);
      
      menu.add (addimport);
      menu.add (addpackage);
      
      return menu;
    },
    
    saveFile : function (evt) {
        var editor = this.editors.getCurrentEditor ();
        var config = this.getConfig();
        if (editor) {
            var app = this;
            var data = editor.getEditorData();
            data.build = true;
            this.workspace.saveFile(data.filesystem, data.path, data, function (rsp) {
              editor.setEditorValue(rsp.formattedcontent, true);
              app.saveConfig(); // saves new breakpoints
              if (rsp.buildtype && rsp.buildtype == "golang")
                app.showBuildResult(rsp);
            });
        }
    },
    saveAll : function () {
      var paths = this.editors.getDirtyPaths ();
      var cb = function (rsp) {
        this.setEditorValue(rsp.formattedcontent, true);        
      };
      for (var i=0; i<paths.length; i++) {
        var editor = this.editors.getEditorFor(paths[i]);
        if (editor) {
          var app = this;
          var data = editor.getEditorData();
          data.build = false;
          this.workspace.saveFile(data.filesystem, data.path, data, qx.lang.Function.bind(cb, editor));
        }
      }
      this.saveConfig(); // save new breakpoints
    },
    build : function (evt, cb) {
        var config = this.getConfig();
        var data = {};
        data.build = true;
        var app = this;
        this.workspace.build(data, function (rsp) {
            var hasErrors = app.showBuildResult(rsp);
            if (cb)
              cb(rsp, hasErrors);
        });
    },
    exit : function (evt) {
      this.workspace.exit();
    },
    run : function (evt) {
      var self = this;
      this.build(evt, function (res, hasErrors) {
        //if (!hasErrors) {
          var conf = self.getConfig();
          var lc = conf.runconfig.configs[conf.runconfig.current];
          var proc = self.launchProcess(lc);
          proc.connect(); 
        //}
      });
    },
    debug : function (evt) {
      var self = this;
      this.build(evt, function (res, hasErrors) {
        //if (!hasErrors) {
          var conf = self.getConfig();
          var lc = conf.runconfig.configs[conf.runconfig.current];
          var proc = self.debugProcess(lc);
          proc.connect(); 
        //}
      });
    },
    
    showBuildResult : function (result) {
        var data = [];
        var hasError = false;
        var hasWarning = false
        if (result && result.buildoutput) {
          this.currentBuildoutput = result.buildoutput;
          result.buildoutput.forEach(function (o) {
            var url = null;
            if (o.type === "error") {
              url = "icon/16/status/dialog-error.png";
              hasError = true;
            }
            if (o.type === "warning") {
              url = "icon/16/status/dialog-warning.png";
              hasWarning = true;
            }
            data.push([url,o.filesystem, o.file,o.line,o.column, o.message,null,null,null,o]); 
          });
        } else {
          this.currentBuildoutput = null;
        }
        this.showAnnotations();
        this.compileroutputModel.setData(data);
        if (hasError)
          this.problems.setIcon("icon/16/status/dialog-error.png");
        else if (hasWarning)
          this.problems.setIcon("icon/16/status/dialog-warning.png");
        else
          this.problems.setIcon(null);
        return hasError;
    },
    showAnnotations : function () {
      var markers = this.getConfig().markers;
      this.editors.showAnnotations(this.currentBuildoutput || [], markers);
    },
    showError : function (fs, src, line, column, message) {
        var app = this;
        var editor = this.editors.getEditorFor(fs, src);
        if (!editor) {
            this.workspace.loadFile (fs, src, function (data) {
                var editor = app.editors.openEditor(fs, src, data.title, data.content, data.filemode);
                editor.jumpTo(line, column);
                app.showAnnotations();
            });  
        } else {
          this.editors.showEditor(editor);
          editor.jumpTo(line, column);
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
                //app.editors.configChanged(app.getConfig().settings.editor);    
                app.fireDataEvent("configChanged", app._configuration);
            });            
        }, this);
        this.getRoot().add(s);
    },
    
    
    createModalTextInputDialog : function(title, message, cb) {
      var dlg = new qx.ui.window.Window(title);
      dlg.setLayout(new qx.ui.layout.VBox(10));
      dlg.setModal(true);
      dlg.setShowClose(false);
      this.getRoot().add(dlg);

      var msg = new qx.ui.basic.Atom(message, "icon/32/status/dialog-information.png");
      dlg.add(msg);
      var input = new qx.ui.form.TextField();
      input.setAllowGrowX(true);
      dlg.add(input, {flex:1});
      
      var box = new qx.ui.container.Composite();
      box.setLayout(new qx.ui.layout.HBox(10, "right"));
      dlg.add(box);

      var btn3 = new qx.ui.form.Button("Ok", "icon/16/actions/dialog-ok.png");
      btn3.addListener("execute", function(e) {
        if (cb) {
          cb(input.getValue());
        }
        dlg.close();
      });
      box.add(btn3);

      var btn4 = new qx.ui.form.Button("Cancel", "icon/16/actions/dialog-cancel.png");
      btn4.addListener("execute", function(e) {
        dlg.close();
      });
      box.add(btn4);
      dlg.center();
      dlg.addListener ("appear", function (e) {
        input.focus ();        
      });
      dlg.addListener("keypress", function (e) {
        if(e.getKeyIdentifier() == "Enter") {
          input.blur();
          btn3.execute();
        } else if (e.getKeyIdentifier() == "Escape") {
          btn4.execute();
        }
        
      }, this);

      dlg.show();
    },
    launchProcess : function (launch) {
      var service = {};
      //service.launchconfig = launch;
      //service.pid = null;
      //service.output = "";
      //service.debug = false;
      //service.defaultname = launch.name;
      //service.name = launch.name;
      //service.session = null;
      //var model = qx.data.marshal.Json.createModel(service);
      var session = new carpo.DebugSession(this.debugger, launch, "", false, launch.name, launch.name);

      var self = this;
      service.connect = function() {
        var pid = "";

        if(service.ws) { return; }
        var ws = self.getWebsocket("launch", launch);
        
        ws.onopen = function(e) { };
  
        ws.onerror = function(e) { console.log("on error"); };
        
        ws.onclose = function (e) {
          session.setPid("");    
          session.setName(session.getDefaultname()+" [STOPPED]");
        };
  
        ws.onmessage = function(e) {
          var data = e.data;
          if (!session.getPid()) {
            pid = pid + data;
            if (pid[pid.length-1] == "\n") {
              session.setPid(pid.trim());    
              session.setName(session.getDefaultname()+" ["+session.getPid()+"]");
            }
          } else {
            session.setOutput(session.getOutput()+e.data);
          }
        };
  
        service.ws = ws;
      };
      this.processes.push(session);
      this.processList.setModelSelection([session]);
      return service;
    },
    debugProcess : function (launch) {
      var service = {};
      //service.launchconfig = launch;
      //service.pid = null;
      //service.output = "";
      //service.debug = true;
      //service.defaultname = "DEBUG: "+launch.name;
      //service.name = launch.name;
      //service.session = null;

      //var model = qx.data.marshal.Json.createModel(service);
      var session = new carpo.DebugSession(this.debugger, launch, "", true, "DEBUG: "+launch.name, launch.name);
      var self = this;
      service.connect = function() {
        var pid = "";
        //var debugSession = null;
        var debugConsoleId = null;
        
        if(service.ws) { return; }
        var ws = self.getWebsocket("debug", launch);
        
        ws.onopen = function(e) { };
  
        ws.onerror = function(e) { console.log("on error"); };
        
        ws.onclose = function (e) {
          session.setPid("");    
          session.setName(session.getDefaultname()+" [STOPPED]");
          session.removeListenerById(debugConsoleId);
          self.debugger.removeSession(session);
        };
  
        ws.onmessage = function(e) {
          var data = e.data;
          if (!session.getPid()) {
            pid = pid + data;
            if (pid[pid.length-1] == "\n") {
              session.setPid(pid.trim());    
              session.setName(session.getDefaultname()+" ["+session.getPid()+"]");
              self.debugger.addSession(session);
              session.setService(service);
              //model.setSession(debugSession);
              debugConsoleId = session.addListener("consoleOutput", function (e) {
                var dat = e.getData();
                console.log("consoleoutput: ", dat);
                session.setOutput(session.getOutput()+dat.line);
              });
            }
          } else {
            console.log("debug-message:",e.data);
            session.message(e.data);
          }
        };
  
        service.ws = ws;
      };
      this.processes.push(session);
      this.processList.setModelSelection([session]);
      return service;
    },
    getWebsocket : function (launchtype, launch) {
      var h = window.location.hostname;
      var p = window.location.port;
      var prot = window.location.protocol=="http:" ? "ws://" : "wss://";
      return new WebSocket(prot+h+":"+p+"/"+launchtype+"/"+launch.id);
    },
    
    installGocode : function (evt) {
      var app = this;
      this.workspace.installgocode (function (env) {
        if (env.gocode && env.gocode.path) {
          app._installGocode.setEnabled(false);
          alert("Autocomplete should work now");
        }
      }, function (err) {
        var er = qx.lang.Json.parse(err.getData());
        alert (er.Message);
      });
    },
    addPackage : function (evt) {
      var ws = this.workspace;
      this.showFilteredPopup(evt, "Search Remote Package", true, function(data) {
      }, function (ed, val) {
        ws.installPackage(val.getName(), function () {
          new carpo.Go(ed.getAceEditor().getValue()).addImport(ed.getAceEditor(), val.getName());
        });
      }, function (filtvalue, data, list) {
        data.removeAll();
        var re = null;
        if (filtvalue && filtvalue.length>2) {
          ws.queryRemotePackages (filtvalue, function (res) {
            if (res && res.packages) {
              res.packages.sort(function (a,b) {return (a.name<b.name)?-1:1});
              res.packages.forEach(function (r) {
                data.push(qx.data.marshal.Json.createModel(r,false));
              });
            }
          });
        }
      });
    },
    addImport : function (evt) {
      var ws = this.workspace;
      this.showFilteredPopup(evt, "Search Local Package", false, function(data) {
        ws.queryPackages (function (res) {
          res.packages.sort(function (a,b) {return (a.name<b.name)?-1:1});
          res.packages.forEach(function (r) {
            data.push(qx.data.marshal.Json.createModel(r,false));
          });
        });
      }, function (ed, val) {
        new carpo.Go(ed.getAceEditor().getValue()).addImport(ed.getAceEditor(), val.getName());
      }, function (filtvalue, data, list) {
        var re = null;
        if (filtvalue) {
          re = new RegExp(filtvalue, 'i');
        }
        list.setDelegate ({
          filter: function(data) {
            if (re) {
              return data.getName().match(re);
            }
            return true;
          }
        });
      });
    },
    showFilteredPopup : function (evt, title, withdesc, loadfunc, selfunc, onfilterchange) {
      var bnds = this.relativeBounds(2);
      var popup = new qx.ui.popup.Popup(new qx.ui.layout.VBox(3)).set({
        backgroundColor: "#FFFAD3",
        padding: [2, 4],
        offset : 3,
        offsetBottom : 20,
        width: bnds.width,
        height: bnds.height
      });

      var head = new qx.ui.basic.Atom(title);
      head.setDecorator("window-caption");
      popup.add(head);
      var filter = new qx.ui.form.TextField();
      popup.add(filter);
      var data = new qx.data.Array();
      var list = new qx.ui.list.List(data);
      list.setLabelPath("name");
      filter.addListener ("input", function (e) {
        onfilterchange(filter.getValue(), data, list);
      }, this);
      
      popup.add(list,{flex:1});
      loadfunc(data);
      popup.addListener("keypress", function (e) {
        if(e.getKeyIdentifier() == "Enter") {
          var ed = this.editors.getCurrentEditor();
          if (ed) {
            selfunc(ed, list.getSelection().toArray()[0]);
          }
          popup.setVisibility("hidden");
          if (ed)
            ed.getAceEditor().focus();
        } else if (e.getKeyIdentifier() == "Escape") {
          popup.setVisibility("hidden");
          var ed = this.editors.getCurrentEditor();
          if (ed)
            ed.getAceEditor().focus();
        }
      }, this);
      list.addListener("dblclick", function (e) {
          var ed = this.editors.getCurrentEditor();
          if (ed) {
            selfunc(ed, list.getSelection().toArray()[0]);
          }
          popup.setVisibility("hidden");
          var ed = this.editors.getCurrentEditor();
          if (ed)
            ed.getAceEditor().focus();
      }, this);
      if (withdesc) {
        var desc = new qx.ui.basic.Atom("<i>... Description ...</i>");
        desc.setDecorator("inset");
        desc.setRich(true);
        popup.add(desc);
        list.getSelection().addListener("change", function (e) {
          if (e.getData().added)
            desc.setLabel(e.getData().added[0].getDescription());
        },this);
      }
      this.center(popup);
      popup.show();
      filter.focus();
    },
    updateEnvironment : function (cb) {
      var self = this;
      this.workspace.loadEnvironment(function (env) {
        cb(env);
      });
    },

    relativeBounds : function (divider) {
      var parent = this.getRoot();
      var bounds = parent.getBounds();
      return {
        width : Math.round(bounds.width / 2),
        height : Math.round(bounds.height / 2)
      };
    },
    
    center : function(widget) {
      var parent = this.getRoot();
      if (parent) {
        var bounds = parent.getBounds();
        if (bounds) {
          var hint = widget.getSizeHint();

          var left = Math.round((bounds.width - hint.width) / 2);
          var top = Math.round((bounds.height - hint.height) / 2);

          if (top < 0) {
            top = 0;
          }
          widget.moveTo(left, top);
        }
      }
    },    
    
    debugButton : function (event) {
        this.debug("Execute button: " + this.getLabel());
    }

  }
});
