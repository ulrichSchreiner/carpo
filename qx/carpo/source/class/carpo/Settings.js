/**
 *
 * @asset(qx/icon/${qx.icontheme}/22/actions/*)
 */
qx.Class.define("carpo.Settings", {
    extend : qx.ui.window.Window,
    events : {
      "ok"   : "qx.event.type.Data"
    },
    
    construct : function()
    {
      this.base(arguments, "Settings");
      this.setLayout(new qx.ui.layout.VBox(10));
      this.setAllowMinimize(false);
      this.setAllowMaximize(false);

      var box = new qx.ui.container.Composite();
      box.setLayout(new qx.ui.layout.HBox(10));
      this.add(box, {flex:1});

      box.add(this.createFontSettings(), {flex:1});
      
      var paneLayout = new qx.ui.layout.HBox().set({
        spacing: 4,
        alignX : "right"
      });
      var buttonPane = new qx.ui.container.Composite(paneLayout).set({
        paddingTop: 11
      });
      this.add(buttonPane);

      var okButton = new qx.ui.form.Button("OK", "icon/22/actions/dialog-apply.png");
      okButton.addState("default");
      okButton.addListener("click", function () {
        this.fireDataEvent("ok", {font:this.getFontSettings()});
        this.close();
      }, this);
      buttonPane.add(okButton);

      var cancelButton = new qx.ui.form.Button("Cancel", "icon/22/actions/dialog-cancel.png");
      buttonPane.add(cancelButton);
      cancelButton.addListener("click", function () {
        this.close();
      }, this);
    },
    
    members : {
        
        createFontSettings : function () {
            var form = new qx.ui.form.Form();

            form.addGroupHeader("Editor Font");      
            var selectBox = new qx.ui.form.SelectBox();
            var fontnames = new Array(
                "arial", "arial black", "comic sans ms", "courier", "courier new", "georgia", 
                "helvetica", "impact", "palatino", "times new roman", "trebuchet ms", "verdana");
            fontnames.forEach(function (f) {
                var item = new qx.ui.form.ListItem("<span style='font-family:"+f+"'>"+f+"</span>",null,f);
                item.setRich(true);
                selectBox.add(item);
            });
            form.add(selectBox, "Font");
            this.fontselect = selectBox;
            var spinner = new qx.ui.form.Spinner(8, 14, 32);
            form.add(spinner, "Size");
            this.fontsize = spinner;
            return new qx.ui.form.renderer.Single(form);
        },
        
        getFontSettings : function () {
            return {
                name:this.fontselect.getSelection()[0].getModel(),
                size:this.fontsize.getValue()
            }
        }
    }
});