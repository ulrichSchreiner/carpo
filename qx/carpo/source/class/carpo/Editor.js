qx.Class.define("carpo.Editor",
{
    extend : qx.ui.tabview.Page,
    properties : {
        filepath: { init: null },
        filename: { init: null },
        content: { init: null },
        mode: { init: null },
        config: { init: null, nullable:true }
    },
    construct : function(filepath, filename, content, mode, config) {
        this.base(arguments, filename);
        this.setLayout(new qx.ui.layout.VBox(0));
        this.setFilepath(filepath);
        this.setFilename(filename);
        this.setContent(content);
        this.setMode(mode);
        this.setConfig(config);
        this.setShowCloseButton(true);
        this.__editor = new qx.ui.core.Widget();
        this.__editor.addListenerOnce("appear", function() {
          this.__onEditorAppear();
        }, this);
        //this.__editor.setVisibility("visible");
        this.add(this.__editor, { flex : 1 });
    },
    
    members: {
        _fontFromConfig : function () {
            var font = "14px monospace"
            if (this.getConfig() && this.getConfig().font) {
                var f = this.getConfig().font;
                font = f.size+"px "+f.name;
            }
            return font;
        },
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
        configChanged : function (config) {
            this.setConfig(config);
            var container = this.__editor.getContentElement().getDomElement();
            container.style.font = this._fontFromConfig();
        },
        showAnnotations : function (annos) {
            this.__ace.getSession().clearAnnotations();
            this.__ace.getSession().setAnnotations(annos);
        },
        __onEditorAppear : function () {
            qx.event.Timer.once(function() {
                var self = this;
                var container = this.__editor.getContentElement().getDomElement();
                container.style.font = this._fontFromConfig();
        
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
                session.on('change', function(e) {
                    self.setContent(session.getValue());
                });
                // copy the inital value
                session.setValue(this.getContent() || "");
        
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