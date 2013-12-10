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
        jumpTo : function (row, col) {
          if (this.__ace) {
            var pos = {row:row-1,col:col};
            this.__ace.moveCursorToPosition(pos);
            this.__ace.scrollToLine(pos.row-1, true, false, function() {});
            this.__ace.focus();
            this.__pos = null;
          } else {
            this.__pos = {row:row,col:col};
          }
        },
        
        _fontFromConfig : function () {
            var font = "14px monospace"
            var config = this.getConfig();
            if (config && config.settings.editor.font) {
                var f = config.settings.editor.font;
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
        setEditorValue : function (val, clean) {
          var pos = this.__ace.getCursorPosition();
          this.__ace.getSession().setValue(val);
          if (pos) {
            this.__ace.moveCursorToPosition(pos);
            this.__ace.scrollToLine(pos.row, true, false, function() {});
          }
          if (clean) {
            this.setLabel(this.getFilename());
          }
        },
        configChanged : function (config) {
            this.setConfig(config);
            var container = this.__editor.getContentElement().getDomElement();
            if (container)
              container.style.font = this._fontFromConfig();
        },
        showAnnotations : function (annos) {
          if (this.__ace) {
            this.__annotations = null;
            this.__ace.getSession().clearAnnotations();
            this.__ace.getSession().setAnnotations(annos);            
          } else {
            this.__annotations = annos;
          }
        },
        refreshEditor : function () {
          var ace = this.__ace;
          if (ace)
            window.setTimeout(function() {
              ace.resize();
            }, 0);
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
                session.setValue(this.getContent() || "");
                if (this.__annotations) {
                  this.showAnnotations(this.__annotations);                  
                }
                if (this.__pos) {
                  // do this a little later, because ace needs a little time to display content
                  qx.event.Timer.once(function () {
                    this.jumpTo(this.__pos.row, this.__pos.col);  
                  },this,100);                  
                }
                session.on('change', function(e) {
                    self.setContent(session.getValue());
                    self.setLabel("*"+self.getFilename());
                });
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