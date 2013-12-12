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
        this.compileroutputModel.setColumns([ "Source", "Line", "Column","Message" ]);
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
            this.showError (data[0], data[1], data[2], data[3]);
        }, this);
        var tcm = this.compileroutput.getTableColumnModel();

        var resizeBehavior = tcm.getBehavior();

        resizeBehavior.setWidth(0, "20%");
        resizeBehavior.setWidth(1, "5%");
        resizeBehavior.setWidth(2, "5%");
        resizeBehavior.setWidth(3, "70%");
        
        this.editors = new carpo.EditorsPane(this, this.workspace, null);
        this.editors.setDecorator("main");
        this.editors.setAllowGrowX(true);
        this.editors.setAllowGrowY(true);
        
        var fb = new carpo.FileBrowser(this, this.workspace);
        fb.addListener ("openFile", function (e) {
          var path = e.getData().getPath();
          var lbl = e.getData().getLabel();
          this.workspace.loadFile (path, function (data) {
              app.editors.openEditor(path, lbl, data.content, data.filemode);     
              app.showAnnotations();
          });          
        }, this);

        this.editors.addListener ("fileSelected", function(e) {
          var path = e.getData().path;
          fb.selectNode(path);
        }, this);

        pane.add(fb, 1);
        pane2.add(this.editors,4);
        pane2.add(this.compileroutput, 1);
        pane2.setDecorator(null);
        pane.add(pane2,4);
        container.add(pane, {flex:1});
        this.getRoot().add(container, {width:"100%", height:"100%"});
        
        this._configuration = {};
        this.refreshConfig(function (config) {
            if (config.settings && config.settings.editor)
                app.editors.configChanged(config.settings.editor);
            app.build();
        });
    },

    currentSelectedEditorPath : function () {
      if (this.editors.getCurrentEditor())
        return this.editors.getCurrentEditor().getFilepath();
      return null;
    },
    
    refreshConfig : function (cb) {
        var app = this;
        this.workspace.loadconfig (function (data) {
            // config data is a pure string ...
            app._configuration = qx.lang.Json.parse(data);
            app._generateDefaultConfig(app._configuration);
            cb(app._configuration);
            app.fireDataEvent("configChanged", app._configuration);
        }, function () {
            app._configuration = {};
            app._generateDefaultConfig(app._configuration);
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
    },
    getToolbar : function () {
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(0);
      toolbar.setDecorator("main");
      this.runconfigs = new qx.ui.form.ComboBox();
      this.runconfigs.addListener ("changeValue",this.runconfigChanged, this);
      toolbar.add (this.runconfigs, {flex:0});
      
      var menu = new qx.ui.menu.Menu();

      var newConfig = new qx.ui.menu.Button("Run Configurations ...");
      newConfig.addListener("execute", function(e) {
        var runconfigs = new carpo.RunConfiguration(this.getConfig());
        runconfigs.center();
        runconfigs.show();        
      }, this);
      menu.add(newConfig);
      
      this.runButton = new qx.ui.form.SplitButton(null,"icon/16/actions/go-next.png", menu);
      toolbar.add(this.runButton);
      this.runButton.addListener ("execute", function (e) {
      }, this);
      return toolbar;
    },
    
    runconfigChanged : function (e) {
    
    },
    getMenuBar : function() {
        var frame = new qx.ui.container.Composite(new qx.ui.layout.Grow());
        frame.setDecorator (null);
        var menubar = new qx.ui.menubar.MenuBar();
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
            this.workspace.saveFile(data.path, data, function (rsp) {
              editor.setEditorValue(rsp.formattedcontent, true);
              if (rsp.buildtype && rsp.buildtype == "golang")
                app.showBuildResult(rsp);
            });
        }
    },
    
    build : function (evt) {
        var config = this.getConfig();
        var data = {};
        data.build = true;
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
             data.push([o.file,o.line,o.column, o.message]); 
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
    showError : function (src, line, column, message) {
        var app = this;
        var editor = this.editors.getEditorFor(src);
        if (!editor) {
            this.workspace.loadFile (src, function (data) {
                var editor = app.editors.openEditor(src, data.title, data.content, data.filemode);
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
    
    debugButton : function (event) {
        this.debug("Execute button: " + this.getLabel());
    }

  }
});
