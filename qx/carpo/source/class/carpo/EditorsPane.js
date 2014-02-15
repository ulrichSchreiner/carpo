/**
 * @asset(qx/icon/${qx.icontheme}/16/apps/*)
 * @asset(carpo/ace/*)
 */
qx.Class.define("carpo.EditorsPane",
{
  extend : qx.ui.tabview.TabView,
    events : {
      "fileSelected"   : "qx.event.type.Data"
    },
    statics : {
        loadAce : function(clb, ctx) {
            var resource = [
                "carpo/ace/ace.js",
                "carpo/ace/ext-elastic_tabstops_lite.js",
                "carpo/ace/ext-emmet.js",
                "carpo/ace/ext-keybinding_menu.js",
                "carpo/ace/ext-modelist.js",
                "carpo/ace/ext-options.js",
                "carpo/ace/ext-searchbox.js",
                "carpo/ace/ext-settings_menu.js",
                "carpo/ace/ext-spellcheck.js",
                "carpo/ace/ext-static_highlight.js",
                "carpo/ace/ext-statusbar.js",
                "carpo/ace/ext-textarea.js",
                "carpo/ace/ext-themelist.js",
                "carpo/ace/ext-whitespace.js",
                "carpo/ace/ext-language_tools.js",
                "carpo/ace/keybinding-emacs.js",
                "carpo/ace/keybinding-vim.js",
                "carpo/ace/theme-eclipse.js",
                "carpo/ace/theme-ambiance.js",
                "carpo/ace/theme-chrome.js",
                "carpo/ace/theme-clouds.js",
                "carpo/ace/theme-github.js",
                "carpo/ace/theme-xcode.js",
                "carpo/ace/theme-eclipse.js",
                "carpo/ace/mode-javascript.js",
                "carpo/ace/mode-css.js",
                "carpo/ace/mode-dart.js",
                "carpo/ace/mode-c_cpp.js",
                "carpo/ace/mode-golang.js",
                "carpo/ace/mode-haskell.js",
                "carpo/ace/mode-html.js",
                "carpo/ace/mode-java.js",
                "carpo/ace/mode-json.js",
                "carpo/ace/mode-makefile.js",
                "carpo/ace/mode-python.js",
                "carpo/ace/mode-sh.js",
                "carpo/ace/mode-sql.js",
                "carpo/ace/mode-text.js",
                "carpo/ace/mode-xml.js",
                "carpo/ace/mode-yaml.js",
                "carpo/ace/mode-javascript.js"
            ];
            var load = function(list) {
                if (list.length === 0) {
                    clb.call(ctx);
                    return;
                }       
                var res = list.shift();
                var uri = qx.util.ResourceManager.getInstance().toUri(res);
                var loader = new qx.bom.request.Script();
                loader.onload = function() {
                    load(list);
                };
                loader.open("GET", uri);
                loader.send();
            };
            load(resource);
        }
    },


    construct : function(app, workspace, config)
    {
      this.base(arguments);
      this.getChildControl("bar").setScrollStep(40);
      this._openeditors = {};
      this.setContentPadding(0,0,0,0);
      this._config = config;
      this._application = app;
      this._workspace = workspace;
      this.__silent = false;

      app.addListener("configChanged", this._configChanged, this);
      this.addListener ("changeSelection", function (evt) {        
        var editors = this.getSelection();
        if (!editors || editors.length === 0) return;
        var editor = evt.getData()[0];
        if (editor) {
          this.saveEditorState();
          editor.refreshEditor ();
          if (this.__silent) return;
          qx.event.Timer.once(function() {
            this.fireDataEvent("fileSelected",{name:editor.getFilename(),path:editor.getFilepath(),filesystem:editor.getFilesystem(), editor:editor});
            editor.focus();
          }, this, 50);
        }
      }, this);
    },
    members: {
        _configChanged : function (e) {
          if (this.__silent) return;
          var config = e.getData();  
          this._config = config;
          for (var ek in this._openeditors) {
              var ed = this._openeditors[ek];
              ed.configChanged (config);
          }
          
          var current = null;
          if (config.editors && config.editors.current)
            current = config.editors.current;
            
          var self = this;
          if (config.editors && config.editors.openfiles) {
            this.__silent = true; // while this flag is set, the editor-state will not be saved
            var ofs = config.editors.openfiles.slice();
            // ugly code to load the files serial, one after another
            var load = function (lst, cb) {
              if (lst.length === 0) {
                cb ();
              } else {
                var f = lst.shift();
                self._workspace.loadFile (f.filesystem, f.path, function (data) {
                  self.__openEditor(f.filesystem, f.path, data.title, data.content, data.filemode);
                  load(lst, cb);
                }, function (err) {
                  load(lst, cb);
                });  
              }
            };
            load (ofs, function () {
              if (current) {
                var ed = self.getEditorFor(current.filesystem, current.path);
                if (ed) {
                  self.fireDataEvent("fileSelected",{name:ed.getFilename(),path:ed.getFilepath(),filesystem:ed.getFilesystem(),editor:ed});
                  self.__showEditor(ed);
                }
              }
              self.__silent = false;
              self.saveEditorState();
            });
          }
        },
        
        saveEditorState : function () {
          if (this.__silent) return;
          this.__silent = true;
          var data = {};
          var editors = [];
          for (var p in this._openeditors) {
            var ed = this._openeditors[p];
            editors.push({path:ed.getFilepath(), filesystem:ed.getFilesystem()});
          }
          data ["editors.openfiles"] = editors;
          var current = this.getCurrentEditor();
          if (current)
            data["editors.current"] = {path:current.getFilepath(),filesystem:current.getFilesystem()};
          else
            data["editors.current"] = null;
          this._application.setConfigValues(data);
          this.__silent = false;
        },
        
        openEditor : function (fs, path, title, content, filemode, whenOpened) {
          var ed = this.__openEditor(fs, path, title, content, filemode);
          if (ed != this.getCurrentEditor()) {
            this.addListenerOnce ("changeSelection", function (evt) {
              if (whenOpened) {
                whenOpened (ed);
              }
            });
            this.showEditor(ed);
            //this.saveEditorState();
          } else {
            if (whenOpened) {
              whenOpened (ed);
            }
          }
          return ed;
        },
        closeAll : function () {
          this.__silent = true;
          for (var ed in this._openeditors) {
            var editor = this._openeditors[ed];
            this.remove(editor);
          }
          this._openeditors = {};
          this.__silent = false;
          this.saveEditorState();
        },
        
        __openEditor : function (fs, path, title, content, filemode) {
          var ed = this._openeditors[fs+":"+path];
          if (ed) {
              return ed;
          } else {
              var page = new carpo.Editor(fs, path, title, content, filemode, this._config, this._workspace, this._application);
              page.addListener ("close", function (evt) {
                  this.editorClosed (evt.getTarget());
              }, this);
              this._openeditors[fs+":"+path] = page;
              this.add(page);
              return page;
          }
        },
        getEditorFor : function (fs, path) {
            return this._openeditors[fs+":"+path];
        },
        getDirtyPaths : function () {
          var result = [];
          for (var p in this._openeditors) {
            var ed = this._openeditors[p];
            if (ed.getDirty()) {
              result.push(p);
            }
          }
          return result;
        },
        showEditor : function (ed) {
          this.__showEditor(ed);
          if (ed != this.getCurrentEditor())
            this.saveEditorState ();
        },
        __showEditor : function (ed) {
          this.setSelection([ed]);
        },
        editorClosed : function (page) {
            // check if dirty and ask to save ...
            //this._openeditors[page.getFilepath()] = null;
            delete this._openeditors[page.getFilesystem()+":"+page.getFilepath()];
            this.saveEditorState ();
        },
        
        getCurrentEditor : function () {
            return this.getSelection()[0];
        },
        showAnnotations : function (probs, markers) {
            var self = this;
            var annotations = {};
            var all = [];
            all = all.concat(probs);
            all = all.concat(markers);
            probs.forEach (function (p) {
                var ed = self.getEditorFor(p.filesystem, p.file);
                if (ed) {
                    var key = p.filesystem+":"+p.file;
                    var annos = annotations[key];
                    if (!annos) annos = [];
                    else annos = annos.a;
                    annos.push({
                       row:p.line-1,
                       column:p.column,
                       text:p.message,
                       type:p.type,
                       filesystem:p.filesystem
                    });
                    annotations[key] = {a:annos,fs:p.filesystem,f:p.file};
                }
            });
            // first clear all annotations
            for (var p in this._openeditors) {
              this._openeditors[p].showAnnotations([]);
            }
            // then show the annotations
            for (var ed in annotations) {
              var ann = annotations[ed];
              self.getEditorFor(ann.fs, ann.f).showAnnotations(ann.a);
            }
        },

        configChanged : function (config) {
          /*
            this._config = config;
            for (var ek in this._openeditors) {
                var ed = this._openeditors[ek];
                ed.configChanged (config);
            }
            */
        }
    }
});