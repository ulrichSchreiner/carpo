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

      //var box = new qx.ui.container.Composite();
      //box.setLayout(new qx.ui.layout.HBox(10));
      var box = new qx.ui.tabview.TabView();
      this.add(box, {flex:1});

      box.add(this.createFontSettings());
      box.add(this.createGoSettings());
      
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
            var selectedFont = "monospace";
            var selectedSize = 14;
            
            form.addGroupHeader("Font");      
            var selectBox = new qx.ui.form.SelectBox();
            var fontnames = new Array(
                "monospace");
            fontnames.forEach(function (f) {
                var item = new qx.ui.form.ListItem("<span style='font-family:"+f+"'>"+f+"</span>",null,f);
                item.setRich(true);
                selectBox.add(item);
            });
            selectBox.setModelSelection([selectedFont]);
            form.add(selectBox, "Font");
            this.fontselect = selectBox;
            var spinner = new qx.ui.form.Spinner(8, selectedSize, 32);
            form.add(spinner, "Size");
            this.fontsize = spinner;
            var page = new qx.ui.tabview.Page("Editor");
            page.setLayout(new qx.ui.layout.VBox(10));
            var renderer = new qx.ui.form.renderer.Double(form);
            //renderer.getLayout().setColumnFlex(0,0);
            //renderer.getLayout().setColumnFlex(1,0);
            page.add (renderer);
            var demoLabel = new qx.ui.basic.Label("the quick brown fox jumps over the lazy dog");
            demoLabel.setDecorator("main");
            demoLabel.setPadding(5);
            var font = new qx.bom.Font(selectedSize,[selectedFont]);
            demoLabel.setFont(font);
            spinner.addListener("changeValue", function(e) {
                var family = [this.fontselect.getSelection()[0].getModel()];
                var f = new qx.bom.Font(e.getData(), family);
                demoLabel.setFont(f);
            }, this);
            selectBox.addListener("changeSelection", function(e) {
                var f = new qx.bom.Font(spinner.getValue(), [e.getData()[0].getModel()]);
                demoLabel.setFont(f);
            }, this);
            page.add(demoLabel);
            return page;
        },
        
        createGoSettings : function () {
            var form = new qx.ui.form.Form();
            var gopath = new qx.ui.form.TextField().set({
                placeholder:"path to 'go' command (or search on PATH)",
                minWidth:300
            });
            this.gopath = gopath;
            form.add(this.gopath, "Go Path");
            var goapppath = new qx.ui.form.TextField().set({
                placeholder:"path to 'goapp' command (or search on PATH)"
            });
            this.goapppath = goapppath;
            form.add (this.goapppath, "GoApp Path");
            var selectBox = new qx.ui.form.SelectBox();
            var apptypes = new Array(
                ["Go","go"],["AppEngine","appengine"]);
            apptypes.forEach(function (f) {
                var item = new qx.ui.form.ListItem(f[0],null,f[1]);
                //item.setRich(true);
                selectBox.add(item);
            });
            this.apptype = selectBox;
            form.add (this.apptype, "Application Type");
            var page = new qx.ui.tabview.Page("Go");
            page.setLayout(new qx.ui.layout.VBox());
            var renderer = new qx.ui.form.renderer.Single(form);
            renderer.getLayout().setColumnFlex(0,0);
            renderer.getLayout().setColumnFlex(1,1);
            page.add (renderer);
            return page;
            
        },
        
        getFontSettings : function () {
            return {
                name:this.fontselect.getSelection()[0].getModel(),
                size:this.fontsize.getValue()
            }
        }
    }
});