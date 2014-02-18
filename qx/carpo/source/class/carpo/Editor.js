qx.Class.define("carpo.Editor",
{
    extend : qx.ui.tabview.Page,
   
    properties : {
        filepath: { init: null },
        filename: { init: null },
        filesystem: {init: null},
        content: { init: null },
        dirty : { init: false },
        mode: { init: null },
        config: { init: null, nullable:true }
    },
    construct : function(filesystem, filepath, filename, content, mode, config, workspace, app) {
        this.base(arguments, filename);
        this.setLayout(new qx.ui.layout.VBox(0));
        this.setFilepath(filepath);
        this.setFilesystem(filesystem);
        this.setFilename(filename);
        this.setContent(content);
        this.setMode(mode);
        this.setConfig(config);
        this.setShowCloseButton(true);
        this._workspace = workspace;
        this._application = app;
        this._contextMenuRow = -1;
        this._documentReset = false;
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
          toggleBP.addListener("execute", this.toggleBreakpoint, this);
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
      toggleBreakpoint : function (e) {
        var row = this._contextMenuRow;
        var session = this.__ace.session;
        
        var bp = session.getBreakpoints()[row];
        bp = bp ? "" : " ace_breakpoint ";
        session.setBreakpoint(row, bp) ;
        if (bp) 
          this._application.debugger.addBreakpoint(this.getFilesystem(), this.getFilepath(), row+1);
        else
          this._application.debugger.removeBreakpoint(this.getFilesystem(), this.getFilepath(), row+1);
      },
      focus : function () {
        if (this.__ace)
          this.__ace.focus();
      },
      jumpTo : function (row, col) {
        if (row <0) return;
        if (this.__ace) {
          var pos = {row:row-1,col:col};
          this.__ace.clearSelection();
          this.__ace.moveCursorToPosition(pos);
          this.__ace.scrollToLine(pos.row-1, true, false, function() {});
          this.__ace.focus();
          this.__pos = null;
        } else {
          this.__pos = {row:row,col:col};
        }
      },
      highlightDebuggerLine : function (line) {
        if (this._currentDebuggerLine) {
          this.__ace.getSession().removeMarker(this._currentDebuggerLine.id);
        }
        if (!this.__ace) {
          this.__currentDebuggerLine = line;
          this.__currentHiliteLine = line;
        } else {
          if (line != -1) {
            this.__ace.scrollToLine(line, true);
            this._currentDebuggerLine = this.__ace.getSession().highlightLines(line-1, line-1);
          }
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
              mode:this.getMode(),
              filesystem:this.getFilesystem()
          };
      },
      setEditorValue : function (val, clean) {
        this._documentReset = true;
        var pos = this.__ace.getCursorPosition();
        var editor = this.__ace;
        //this.__ace.getSession().setValue(val);
        editor.setValue(val,-1);
        if (pos) {
          editor.moveCursorToPosition(pos);
          editor.scrollToLine(pos.row, true, false, function() {});
        }
        if (clean) {
          this.setLabel(this.getFilename());
          this.setDirty(false);
        }
        var maxlen = editor.getSession().getDocument().getLength();
        var dbg =this._application.debugger;
        var bps = dbg.getBreakpointsFor (this.getFilesystem(), this.getFilepath());
        if (bps) {
          bps.forEach(function (b) {
            if (b.line >= maxlen) {
              dbg.removeBreakpoint(b.filesystem, b.source, b.line-1);
            } else {
              editor.getSession().setBreakpoint(b.line-1, " ace_breakpoint ") ; 
            }
          });
        }
        this._documentReset = false;
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
      getAceEditor : function () {
        return this.__ace;
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
          // create the editor
          var editor = this.__ace = ace.edit(container);
          editor.setTheme("ace/theme/eclipse");
          editor.commands.addCommand({
            name: "addPackcage",
            bindKey: {win: "Ctrl-Shift-M", mac: "Command-Option-Shift-M"},
            exec: function(editor) {
              self._application.addImport();
            }
          });
          container.style.font = this._fontFromConfig();

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
                        meta:s.meta,
                        completer : {
                          insertMatch:function(ed) {
                            new carpo.Go(ed.getValue()).addImport(ed, s.name);
                          }
                        }
                      };
                    }
                    if (s.type === "install") {
                      return {
                        caption:s.nice, 
                        value:s.name, 
                        meta:s.meta,
                        completer : {
                          insertMatch:function(ed) {
                            self._workspace.installPackage(s.name, function () {
                              new carpo.Go(ed.getValue()).addImport(ed, s.name);
                            });
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
          var updateBPs = qx.lang.Function.bind(this.updateBreakpoints, this);
          session.on('change', function(e) {
            var data = e.data;
            updateBPs(session, data);
            self.setContent(session.getValue());
            self.setLabel("*"+self.getFilename());
            self.setDirty(true);
          });
          var bps = self._application.debugger.getBreakpointsFor (this.getFilesystem(), this.getFilepath());
          if (bps) {
            bps.forEach(function (b) {
              session.setBreakpoint(b.line-1, " ace_breakpoint ") ; 
            });
          }
          if (this.__currentHiliteLine)
            qx.event.Timer.once(function () {
              this.highlightDebuggerLine(this.__currentHiliteLine);
            },this,100);
            
            
          editor.on("guttermousedown", qx.lang.Function.bind(this.showGutterMenu, this));
          // append resize listener
          this.__editor.addListener("resize", function() {
            // use a timeout to let the layout queue apply its changes to the dom
            window.setTimeout(function() {
              self.__ace.resize();                  
            }, 0);
          });
        }, this, 100);            
      },
      updateBreakpoints : function (session, event) {
        if (this._documentReset) return;
        var start = event.range.start.row;
        var end = event.range.end.row;
        if (start == end) return;
        var bps = this._application.debugger.getBreakpointsFor(this.getFilesystem(), this.getFilepath());
        var changed = false;
        var diff = end - start;
        var targ = this["check_"+event.action];
        if (!targ) {
          //console.log("no handler for session event:",event);
          return;
        }
        var func = qx.lang.Function.bind(targ, this);
        if (bps) {
          for (var i=0; i<bps.length; i++) {
            var bp = bps[i];
            changed = changed || func (session, start, end, diff, bp);
          }
        }
      },
      _check_bp : function (session, start, end, diff, bp) {
        if (start > bp.line-1) return false; // breakpoint is before change area
        this._application.debugger.removeBreakpoint (bp.filesystem, bp.source, bp.line, true);
        session.setBreakpoint(bp.line-1, "") ;
        this._application.debugger.addBreakpoint (bp.filesystem, bp.source, bp.line+diff, true);
        session.setBreakpoint(bp.line+diff-1, " ace_breakpoint ") ;
        return true;
      },
      check_insertText : function (session, start, end, diff, bp) {
        return this._check_bp(session, start, end, diff, bp);
      },
      check_removeLines : function (session, start, end, diff, bp) {
        return this.check_removeText(session, start, end, diff, bp);
      },
      check_removeText : function (session, start, end, diff, bp) {
        if (this.between(start, bp.line-1, end)) {
          this._application.debugger.removeBreakpoint (bp.filesystem, bp.source, bp.line, true);
          session.setBreakpoint(bp.line-1, "") ;
          return true;
        }
        return this._check_bp(session, start, end, -1*diff, bp);
      },
      
      between : function (lim1, val, lim2) {
        if (val <= lim2 && val >= lim1) return true;
        if (val <= lim1 && val >= lim2) return true;
        return false;
      }
    }
});