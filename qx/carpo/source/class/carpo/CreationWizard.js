/**
 *
 */
qx.Class.define("carpo.CreationWizard", {
    extend : qx.ui.window.Window,
    events : {
    },
    statics : {
    },
    
    construct : function(workspace,app) {
      this.base(arguments, "Create ...");
      this.workspace = workspace;
      this.application = app;
      this.setLayout(new qx.ui.layout.VBox(20));
      this.setAllowMinimize(false);
      this.setAllowMaximize(false);
      this.setAllowGrowY(true);
      this.setAllowGrowX(true);
      
      this.panelObjects = {};
      var container = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      this.wizards = new qx.ui.form.SelectBox();
      this.wizards.addListener("changeSelection", function (e) {
        var w = e.getData()[0];
        this.panels.removeAll();
        this.showPanel(w.getLabel());
      },this);
      container.add(this.wizards);
      //this.panels = new qx.ui.container.Composite(new qx.ui.layout.Canvas());
      this.panels = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      //this.panels.setDecorator("main");
      this.panels.setAllowGrowY(true);
      this.panels.setAllowGrowX(true);
      container.add(this.panels,{flex:1});
      var buttons = new qx.ui.container.Composite(new qx.ui.layout.HBox(2));
      // buttons
      var saveButton = new qx.ui.form.Button("Save");
      saveButton.addListener ("execute", function () {
        if (this.currentPanel.ok())
          this.close();
      },this);
      saveButton.setWidth(70);
      buttons.add(saveButton);
      var cancelButton = new qx.ui.form.Button("Cancel");
      cancelButton.addListener ("execute", function () {
        if (this.currentPanel.cancel)
          this.currentPanel.cancel();
        this.close();
      },this);
      cancelButton.setWidth(70);
      buttons.add(cancelButton);
      container.add(buttons);
      this.add(container, {flex:1});
      this.setupCreationPanels();
    },
    
    members : {
      setupCreationPanels : function () {
        this._commandLineUtility();
      },
      
      showPanel : function (pan) {
        var panel = this.panelObjects[pan];
        this.currentPanel = panel;
        panel.panel.setAllowGrowY(true);
        this.panels.add(panel.panel);
      },
      
      registerPanel : function (name, panel, onok, oncancel) {
        this.panelObjects[name] = {
          panel : panel,
          ok : onok,
          cancel : oncancel
        };
        var li = new qx.ui.form.ListItem(name);
        this.wizards.add(li);
      },
      
      _commandLineUtility : function () {
        var title = "Command Line Utility";
        var groupBox = new qx.ui.groupbox.GroupBox();
        groupBox.setLayout(new qx.ui.layout.Canvas());

        // form
        var form = new qx.ui.form.Form();

        // add the form items
        var nameTextfield = new qx.ui.form.TextField();
        nameTextfield.setRequired(true);
        nameTextfield.setWidth(300);
        form.add(nameTextfield, "Name", null, "name");

        form.add(new qx.ui.form.TextField(), "Base import path",null,"baseimportpath");
        
        groupBox.add(new qx.ui.form.renderer.Single(form));
        var controller = new qx.data.controller.Form(null, form);
        var model = controller.createModel();
        
        var self = this;
        this.registerPanel (title, groupBox, function () {
          var doc = {
            name : model.getName(),
            importpath : model.getBaseimportpath()
          };
          self.workspace.wizardCommandLine (doc, function (res) {
            self.application.build(null, function (rsp, hasErrors) {
              var config = carpo.RunConfiguration.newConfig("999");
              config.name = model.getName();
              config.executable = "{{.Workspace}}/bin/"+config.name;
              self.application.addRunconfiguration(config);
              self.application.openFile(res.filesystem, res.path);
            });
          });
          return true;
        });
      }
    }
});