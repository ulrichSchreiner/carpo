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
      var l1 = new qx.ui.basic.Label("Lorem ipsum dolor sit amet");
      l1.setRich(true);
      l1.setDecorator("main");
      l1.setAllowGrowX(true);
      var l2 = new qx.ui.basic.Label("Lorem ipsum dolor sit amet");
      l2.setRich(true);
      l2.setDecorator("main");
      l2.setAllowGrowX(true);
      var tree = new qx.ui.treevirtual.TreeVirtual("Workspace");
      //tree.setColumnWidth(0, 400);
      tree.setAlwaysShowOpenCloseSymbol(true);
      tree.setDecorator("main");
      tree.setAllowGrowX(true);
      
      pane.add(tree);
      pane.add(l2);
      container.add(pane, {flex:1});
      this.getRoot().add(container, {width:"100%", height:"100%"});
      
      var ws = new carpo.Workspace();
      ws.dir("/src");
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
