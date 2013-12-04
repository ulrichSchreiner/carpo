qx.Class.define("carpo.Settings",
{
  extend : qx.ui.window.Window,

    construct : function()
    {
      this.base(arguments, "Settings");
      this.setLayout(new qx.ui.layout.VBox(10));
      this.setAllowMinimize(false);
      this.setAllowMaximize(false);
      var atom = new qx.ui.basic.Atom("Carpo Settings");
      this.add(atom);

      var box = new qx.ui.container.Composite();
      box.setLayout(new qx.ui.layout.HBox(10));
      this.add(box, {flex:1});

      var fontSettings = new qx.ui.groupbox.GroupBox("Editor Font");
      fontSettings.setLayout(new qx.ui.layout.VBox(4));
      this.createFontSettings(fontSettings);
      box.add(fontSettings, {flex:1});
    },
    
    members : {
        createFontSettings : function (box) {
            box.add(new qx.ui.basic.Label("Font"));

            var selectBox = new qx.ui.form.SelectBox();
            var fontnames = new Array(
                "arial", "arial black", "comic sans ms", "courier", "courier new", "georgia", 
                "helvetica", "impact", "palatino", "times new roman", "trebuchet ms", "verdana");
            fontnames.forEach(function (f) {
                var item = new qx.ui.form.ListItem("<span style='font-family:"+f+"'>"+f+"</span>");
                item.setRich(true);
                selectBox.add(item);
            });
            box.add(selectBox);
            box.add(new qx.ui.basic.Label("Size"));
            var spinner = new qx.ui.form.Spinner(8, 14, 32);
            box.add(spinner);
        }
    }
});