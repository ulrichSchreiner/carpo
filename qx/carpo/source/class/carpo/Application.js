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
      var container = new qx.ui.container.Composite(new qx.ui.layout.VBox(2)).set({
        decorator: "main",
        allowGrowY: true,
        allowGrowX: true
      });
      container.add(this.getMenuBar(),{flex:0});
      
      var pane = new qx.ui.splitpane.Pane("horizontal").set({
        //width : 450,
        //height : 300
        allowGrowY: true,
        allowGrowX: true
      });
      var editors = new carpo.EditorsPane();
      editors.setDecorator("main");
      editors.setAllowGrowX(true);
      editors.setAllowGrowY(true);
      
      var l2 = new qx.ui.basic.Label("Lorem ipsum dolor sit amet");
      l2.setRich(true);
      l2.setDecorator("main");
      l2.setAllowGrowX(true);
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
                editors.openEditor(pt, node.label, data.content);                 
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
      pane.add(editors,4);
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
        return pt;
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
        this.workspace.loadconfig (function (data) {
            // config data is a pure string ...
            this._configuration = qx.lang.Json.parse(data);
            cb(this._configuration);
        });
    },
    getConfig : function ()  {
        return this._configuration;
    },
    
    getMenuBar : function() {
      var frame = new qx.ui.container.Composite(new qx.ui.layout.Grow());

      var menubar = new qx.ui.menubar.MenuBar();
      //menubar.setWidth(600);
      frame.add(menubar);

      var fileMenu = new qx.ui.menubar.Button("File", null, this.getFileMenu());
      //var editMenu = new qx.ui.menubar.Button("Edit", null, this.getEditMenu());
      //var searchMenu = new qx.ui.menubar.Button("Search", null, this.getSearchMenu());
      //var viewMenu = new qx.ui.menubar.Button("View", null, this.getViewMenu());
      //var formatMenu = new qx.ui.menubar.Button("Format", null, this.getFormatMenu());
      //var helpMenu = new qx.ui.menubar.Button("Help", null, this.getHelpMenu());

      menubar.add(fileMenu);
      //menubar.add(editMenu);
      //menubar.add(searchMenu);
      //menubar.add(viewMenu);
      //menubar.add(formatMenu);
      //menubar.add(helpMenu);

      return frame;
    },

    getFileMenu : function()
    {
      var menu = new qx.ui.menu.Menu();

      var newButton = new qx.ui.menu.Button("New", "icon/16/actions/document-new.png", this._newCommand);
      var openButton = new qx.ui.menu.Button("Open", "icon/16/actions/document-open.png", this._openCommand);
      var closeButton = new qx.ui.menu.Button("Close");
      var saveButton = new qx.ui.menu.Button("Save", "icon/16/actions/document-save.png", this._saveCommand);
      var saveAsButton = new qx.ui.menu.Button("Save as...", "icon/16/actions/document-save-as.png");
      var printButton = new qx.ui.menu.Button("Print", "icon/16/actions/document-print.png");
      var exitButton = new qx.ui.menu.Button("Exit", "icon/16/actions/application-exit.png");

      newButton.addListener("execute", this.debugButton);
      openButton.addListener("execute", this.debugButton);
      closeButton.addListener("execute", this.debugButton);
      saveButton.addListener("execute", this.debugButton);
      saveAsButton.addListener("execute", this.debugButton);
      printButton.addListener("execute", this.debugButton);
      exitButton.addListener("execute", this.debugButton);

      menu.add(newButton);
      menu.add(openButton);
      menu.add(closeButton);
      menu.add(saveButton);
      menu.add(saveAsButton);
      menu.add(printButton);
      menu.add(exitButton);

      return menu;
    },
    
    debugButton : function (event) {
        this.debug("Execute button: " + this.getLabel());
    }

  }
});
