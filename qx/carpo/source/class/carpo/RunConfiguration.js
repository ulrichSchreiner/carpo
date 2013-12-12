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
        decorator: "main",
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
        console.log("add clicked");
        this.data.push(this.newConfig(this.data.getLength()));
      }, this);
      var removeButton = new qx.ui.form.Button(null,"icon/16/actions/list-remove.png");
      toolbar.add(removeButton);
      removeButton.addListener ("click", function (e) {
        var m = this.configList.getSelection()[0].getModel();
        this.data.remove(m);
        //console.log("remove clicked");
      }, this);
      var left = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      left.setAllowGrowX(true);
      left.setAllowGrowY(true);
      left.add (toolbar);
      left.add(this.configList, {flex:1});
      container.add(left, {edge:"west"});

      var cent = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      cent.setPadding(5);
      cent.setDecorator("main");
      cent.add(new qx.ui.basic.Label("Name"));
      this.txtName = new qx.ui.form.TextField("");
      cent.add(this.txtName);
      cent.add(new qx.ui.basic.Label("Executable"));
      this.txtExecutable = new qx.ui.form.TextField("");
      this.txtExecutable.setMinWidth(350);
      cent.add(this.txtExecutable);
      cent.add(new qx.ui.basic.Label("Parameter"));
      this.txtParams = new qx.ui.form.TextField("");
      cent.add(this.txtParams);
      cent.add(new qx.ui.basic.Label("Environment (<key>=<val> per Line)"))
      this.txtEnvironment = new qx.ui.form.TextArea("");
      cent.add(this.txtEnvironment);
      container.add(cent, {edge:"center"});
      this.add(container,{flex:1});
      var data = [];
      this.data = new qx.data.Array(data);
      this.controller = new qx.data.controller.List (this.data, this.configList, "name");
      this.controller.bind("selection[0].name", this.txtName, "value");
      //this.txtName.bind("value", this.controller, "selection[0].name");
      this.controller.bind("selection[0].executable", this.txtExecutable, "value");
      this.controller.bind("selection[0].params", this.txtParams, "value");
      this.controller.bind("selection[0].environment", this.txtEnvironment, "value");
    },
    members : {
      newConfig : function (num) {
        return qx.data.marshal.Json.createModel({
          id : "config-"+num,
          name :"New Configuration",
          executable:"${workspace}/bin/yourprogramm",
          params : "",
          environment : "ENV1=val1"
        });
      }
    }
});
