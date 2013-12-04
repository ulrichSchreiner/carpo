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
      var tcm = this.compileroutput.getTableColumnModel();

      var resizeBehavior = tcm.getBehavior();

      resizeBehavior.setWidth(0, "20%");
      resizeBehavior.setWidth(1, "10%");
      resizeBehavior.setWidth(2, "70%");
      
      this.editors = new carpo.EditorsPane(null);
      
      this.editors.setDecorator("main");
      this.editors.setAllowGrowX(true);
      this.editors.setAllowGrowY(true);

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
         //this.buildTreeNodes(dm, node.nodeId, "/"+node.label);
      }, this);
      
      pane.add(tree,1);
      pane2.add(this.editors,4);
      pane2.add(this.compileroutput, 1);
      pane.add(pane2,4);
      container.add(pane, {flex:1});
      this.getRoot().add(container, {width:"100%", height:"100%"});

      this.buildTreeNodes (dm, null, "/");
      /*
      this.workspace.dir("/", function (data) {
          data.entries.sort(function(a,b) {
              return a.name.localeCompare(b.name);
          }).forEach(function (el, idx) {
            if (el.dir) {
                dm.addBranch(null,el.name, false);
            } else {
                dm.addLeaf(null, el.name);
            }
          });
          dm.setData();
      });*/
      this._configuration = {};
      this.refreshConfig(function (config) {
        var filter = qx.lang.Function.bind(function(node) {
            var label = node.label;
            if (config.hidefiles && config.hidefiles!=="") {
                return new RegExp(config.hidefiles).exec(label) === null;
            }
            return true;
        }, this);
        dm.setFilter(filter);
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
            var data = editor.getEditorData();
            data.build = true;
            var builder = config.apptype;
            if (builder) {
                data.buildtype = builder;
                data.builder = config[builder];
            }
            this.workspace.saveFile(data.path, data, function (rsp) {
                console.log(rsp);
            });
        }
    },
    
    showSettings : function(evt) {
        var s = new carpo.Settings();
        s.setModal(true);
        s.moveTo(100,100);
        s.open();
        s.addListener("ok", function (e) {
            console.log("settings: ",e.getData());
            this.editors.configChanged(e.getData());
        }, this);
        this.getRoot().add(s);
    },
    
    debugButton : function (event) {
        this.debug("Execute button: " + this.getLabel());
    }

  }
});
