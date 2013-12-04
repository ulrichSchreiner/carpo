qx.Class.define("carpo.Editor",
{
    extend : qx.ui.tabview.Page,
    properties : {
        filepath: { init: null },
        filename: { init: null },
        content: { init: null },
        mode: { init: null }
    },
    construct : function(filepath, filename, content, mode) {
        this.base(arguments, filename);
        this.setLayout(new qx.ui.layout.VBox(0));
        this.setFilepath(filepath);
        this.setFilename(filename);
        this.setContent(content);
        this.setMode(mode);
        this.setShowCloseButton(true);
        this.__editor = new qx.ui.core.Widget();
        this.__editor.addListenerOnce("appear", function() {
          this.__onEditorAppear();
        }, this);
        //this.__editor.setVisibility("visible");
        this.add(this.__editor, { flex : 1 });
    },
    
    members: {
        getEditorValue : function () {
            return this.__ace.getSession().getValue();  
        },
        getEditorData : function () {
            return {
                content:this.getEditorValue(),
                path:this.getFilepath(),
                mode:this.getMode()
            };
        },
        setEditorValue : function (val) {
            this.__ace.getSession().setValue(val);
        },
        __onEditorAppear : function () {
            qx.event.Timer.once(function() {
                var container = this.__editor.getContentElement().getDomElement();
        
                // create the editor
                var editor = this.__ace = ace.edit(container);
                editor.setTheme("ace/theme/eclipse");
        
                // set javascript mode
                var mode = ace.require("ace/ext/modelist").getModeForPath(this.getFilename());
                editor.getSession().setMode(mode.mode);
        
                // configure the editor
                var session = editor.getSession();
                session.setUseSoftTabs(true);
                session.setTabSize(2);
        
                // copy the inital value
                session.setValue(this.getContent() || "");
        
                var self = this;
                // append resize listener
                this.__editor.addListener("resize", function() {
                  // use a timeout to let the layout queue apply its changes to the dom
                  window.setTimeout(function() {
                    self.__ace.resize();
                  }, 0);
                });
            }, this, 100);            
        }
    }
});