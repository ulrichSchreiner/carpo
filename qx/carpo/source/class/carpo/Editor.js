qx.Class.define("carpo.Editor",
{
    extend : qx.ui.tabview.Page,
   
    properties : {
        filepath: { init: null },
        filename: { init: null },
        content: { init: null },
        dirty : { init: false },
        mode: { init: null },
        config: { init: null, nullable:true }
    },
    construct : function(filepath, filename, content, mode, config, workspace) {
        this.base(arguments, filename);
        this.setLayout(new qx.ui.layout.VBox(0));
        this.setFilepath(filepath);
        this.setFilename(filename);
        this.setContent(content);
        this.setMode(mode);
        this.setConfig(config);
        this.setShowCloseButton(true);
        this._workspace = workspace;
        this._contextMenuRow = -1;
        this.__editor = new qx.ui.core.Widget();
        this.__editor.addListenerOnce("appear", function() {
          this.__onEditorAppear();
        }, this);
        //this.__editor.setVisibility("visible");
        this.add(this.__editor, { flex : 1 });
    },
    
    members: {
        getGutterContextMenu : function (e) {
          if (!this.gutterContextMenu) {
            var menu = new qx.ui.menu.Menu();
            var toggleBP = new qx.ui.menu.Button("Toggle Breakpoint");
            toggleBP.addListener("execute", this.addBreakpoint, this);
            var addMarker = new qx.ui.menu.Button("Add Marker");
            addMarker.addListener("execute", this.addMarker, this);
            menu.add(toggleBP);
            //menu.add(addMarker); only partial implemented
            this.gutterContextMenu = menu;
          }
          return this.gutterContextMenu;
        },
        showGutterMenu : function (e) {
          if (e.getButton() == 2) { 
            var m = this.getGutterContextMenu();
            var pos = {left:e.clientX,top:e.clientY};
            qx.bom.Event.stopPropagation(e); 
            this._contextMenuRow = e.getDocumentPosition().row ;
            m.openAtPoint({ 
              top: e.clientY, 
              left: e.clientX 
            }); 
          }
        },
        addMarker : function (e) {
        },
        addBreakpoint : function (e) {
          var row = this._contextMenuRow;
          var session = this.__ace.session;
          
          var bp = session.getBreakpoints()[row];
          bp = bp ? "" : " ace_breakpoint ";

          session.setBreakpoint(row, bp) ;
        },
        focus : function () {
          if (this.__ace)
            this.__ace.focus();
        },
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
            var font = "14px monospace";
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
          //this.__ace.getSession().setValue(val);
          this.__ace.setValue(val,-1);
          if (pos) {
            this.__ace.moveCursorToPosition(pos);
            this.__ace.scrollToLine(pos.row, true, false, function() {});
          }
          if (clean) {
            this.setLabel(this.getFilename());
            this.setDirty(false);
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
                
                var completer = ace.require("ace/ext/language_tools");
                var goCompleter = {
                  getCompletions: function(compEdit, compSession, pos, prefix, callback) {
                    var rq = {
                      content:compSession.getValue(),
                      path:self.getFilepath(),
                      row:pos.row,
                      column:pos.column
                    };
                    self._workspace.autocomplete(rq, function (sugg) {
                      if (sugg.suggestions) {
                        var suggestions = sugg.suggestions.map(function (s) {
                          if (s.type === "import") {
                            return {
                              caption:s.nice, 
                              value:s.name, 
                              completer : {
                                insertMatch:function(ed) {
                                  new carpo.Go(ed.getValue()).addImport(ed, s.name);
                                }
                              }
                            };
                          }
                          if (s['class'] === "func") {
                            return {
                              caption:s.nice, 
                              value:carpo.Go.getFuncSignatureWithoutReturn(s.nice),
                              completer : {
                                insertMatch:function(ed) {
                                  var range = ed.selection.getAllRanges()[0];
                                  range.start.column -= ed.completer.completions.filterText.length;
                                  ed.session.remove(range);
                                  var insert = carpo.Go.getFuncParamList("func",s.type,s.name);
                                  ed.execCommand("insertstring", insert.text);
                                  if (insert.paramlen > 0) {
                                    range.start.column += (insert.len);
                                    ed.moveCursorToPosition(range.start);
                                    ed.session.getSelection().selectWordRight();
                                  }
                                }
                              }
                            };
                          }
                          return {caption:s.nice, value:s.name};
                        });
                        callback(null, suggestions);
                      } else {
                        callback(null,[]);
                      }
                    });
                  }};
                //completer.addCompleter(goCompleter);

                editor.setOptions({enableBasicAutocompletion: true});
                editor.completers = [goCompleter];
                
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
                    self.setDirty(true);
                });
                this.__ace.on("guttermousedown", qx.lang.Function.bind(this.showGutterMenu, this));
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