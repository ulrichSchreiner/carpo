/**
 *
 * @asset(qx/icon/${qx.icontheme}/16/actions/*)
 */
qx.Class.define("carpo.RunConfiguration", {
    extend : qx.ui.window.Window,
    events : {
      "ok"   : "qx.event.type.Data"
    },
    construct : function(settings) {
      this.base(arguments, "Run Configuration");
      this.settings = settings;
      this.setLayout(new qx.ui.layout.VBox(0));
      var container = new qx.ui.container.Composite(new qx.ui.layout.Dock()).set({
        decorator: null,
        padding: 4,
        allowGrowY : true,
        allowGrowX : true
      });
      this.configList = new qx.ui.form.List();
      this.configList.setAllowGrowY(true);
      this.configList.setMinWidth(180);
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(0);
      toolbar.setDecorator("main");
      var addButton = new qx.ui.form.Button(null,"icon/16/actions/list-add.png");
      toolbar.add(addButton);
      addButton.addListener ("click", function (e) {
        this.data.push(this.newConfig(this.data.getLength()));
      }, this);
      var removeButton = new qx.ui.form.Button(null,"icon/16/actions/list-remove.png");
      toolbar.add(removeButton);
      removeButton.addListener ("click", function (e) {
        var m = this.configList.getSelection()[0].getModel();
        this.data.remove(m);
      }, this);
      var left = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      left.setAllowGrowX(true);
      left.setAllowGrowY(true);
      left.add (toolbar);
      left.add(this.configList, {flex:1});

      var cent = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      cent.setPadding(5);
      cent.setDecorator("main");
      cent.add(new qx.ui.basic.Label("Name"));
      this.txtName = new qx.ui.form.TextField("");
      this.txtName.addListener ("input", this.valueChanged("name"), this);
      cent.add(this.txtName);
      
      cent.add(new qx.ui.basic.Label("Executable"));
      this.txtExecutable = new qx.ui.form.TextField("");
      this.txtExecutable.setMinWidth(350);
      this.txtExecutable.addListener ("input", this.valueChanged("executable"), this);
      cent.add(this.txtExecutable);

      cent.add(new qx.ui.basic.Label("Working Directory"));
      this.txtWorkDir = new qx.ui.form.TextField("");
      this.txtWorkDir.setMinWidth(350);
      this.txtWorkDir.addListener ("input", this.valueChanged("workingDirectory"), this);
      cent.add(this.txtWorkDir);

      cent.add(new qx.ui.basic.Label("Parameter (optionally surrounded  by \")"));
      this.txtParams = new qx.ui.form.TextField("");
      this.txtParams.addListener ("input", this.valueChanged("params"), this);
      cent.add(this.txtParams);

      cent.add(new qx.ui.basic.Label("Environment (<key>=<val> per Line)"));
      this.txtEnvironment = new qx.ui.form.TextArea("");
      this.txtEnvironment.addListener ("input", this.valueChanged("environment"), this);
      cent.add(this.txtEnvironment);

      var data = new qx.data.Array();
      for (var c in settings.runconfig.configs) {
        var val = settings.runconfig.configs[c];
        if (!val.workingDirectory) val.workingDirectory = "";
        data.push(qx.data.marshal.Json.createModel(val));
      }
      this.data = data;
      this.controller = new qx.data.controller.List (this.data, this.configList, "name");
      this.controller.bind("selection[0].name", this.txtName, "value");
      this.controller.bind("selection[0].executable", this.txtExecutable, "value");
      this.controller.bind("selection[0].workingDirectory", this.txtWorkDir,"value");
      this.controller.bind("selection[0].params", this.txtParams, "value");
      this.controller.bind("selection[0].environment", this.txtEnvironment, "value");
      
      var box = new qx.ui.container.Composite();
      box.setPaddingTop(4);
      box.setLayout(new qx.ui.layout.HBox(10, "right"));

      var btn3 = new qx.ui.form.Button("Ok", "icon/16/actions/dialog-ok.png");
      btn3.addListener("execute", function(e) {
        var res = {};
        var reslist = qx.util.Serializer.toNativeObject(this.data);
        reslist.forEach(function (d) {
          res[d.id] = d;
        });
        this.fireDataEvent("ok",res);
        this.close();
      }, this);
      box.add(btn3);

      var btn4 = new qx.ui.form.Button("Cancel", "icon/16/actions/dialog-cancel.png");
      btn4.addListener("execute", function(e) {
        this.close();
      }, this);
      box.add(btn4);
      this.addListener("keypress", function (e) {
        if(e.getKeyIdentifier() == "Enter") {
          btn3.focus();
          btn3.execute();
        } else if (e.getKeyIdentifier() == "Escape") {
          btn4.execute();
        }
        
      }, this);
      
      container.add(box,{edge:"south"});
      container.add(left, {edge:"west"});
      container.add(cent, {edge:"center"});
      this.add(container,{flex:1});
      this.setModal(true);
    },
    members : {
      valueChanged : function (target) {
        var self = this;
        return function (e) {
          var m = self.configList.getSelection()[0].getModel();
          var newval = e.getData();
          m.set(target,newval);
        }
      },
      configmodel : function (c) {
        return qx.data.marshal.Json.createModel(c);
      },
      newConfig : function (num) {
        return qx.data.marshal.Json.createModel({
          id : "config-"+num,
          name :"New Configuration",
          executable:"{{.Workspace}}/bin/yourprogram",
          params : "",
          environment : "ENV1=val1"
        });
      }
    }
});
