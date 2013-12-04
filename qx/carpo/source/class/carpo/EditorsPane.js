/**
 * @asset(qx/icon/${qx.icontheme}/16/apps/*)
 * @asset(carpo/bower_components/ace-builds/src/*)
 */
qx.Class.define("carpo.EditorsPane",
{
  extend : qx.ui.tabview.TabView,

    statics : {
        loadAce : function(clb, ctx) {
            var resource = [
                "carpo/bower_components/ace-builds/src/ace.js",
                "carpo/bower_components/ace-builds/src/ext-elastic_tabstops_lite.js",
                "carpo/bower_components/ace-builds/src/ext-emmet.js",
                "carpo/bower_components/ace-builds/src/ext-keybinding_menu.js",
                "carpo/bower_components/ace-builds/src/ext-modelist.js",
                "carpo/bower_components/ace-builds/src/ext-options.js",
                "carpo/bower_components/ace-builds/src/ext-searchbox.js",
                "carpo/bower_components/ace-builds/src/ext-settings_menu.js",
                "carpo/bower_components/ace-builds/src/ext-spellcheck.js",
                "carpo/bower_components/ace-builds/src/ext-static_highlight.js",
                "carpo/bower_components/ace-builds/src/ext-statusbar.js",
                "carpo/bower_components/ace-builds/src/ext-textarea.js",
                "carpo/bower_components/ace-builds/src/ext-themelist.js",
                "carpo/bower_components/ace-builds/src/ext-whitespace.js",
                "carpo/bower_components/ace-builds/src/keybinding-emacs.js",
                "carpo/bower_components/ace-builds/src/keybinding-vim.js",
                "carpo/bower_components/ace-builds/src/theme-eclipse.js",
                "carpo/bower_components/ace-builds/src/theme-ambiance.js",
                "carpo/bower_components/ace-builds/src/theme-chrome.js",
                "carpo/bower_components/ace-builds/src/theme-clouds.js",
                "carpo/bower_components/ace-builds/src/theme-github.js",
                "carpo/bower_components/ace-builds/src/theme-xcode.js",
                "carpo/bower_components/ace-builds/src/theme-eclipse.js",
                "carpo/bower_components/ace-builds/src/mode-javascript.js",
                "carpo/bower_components/ace-builds/src/mode-css.js",
                "carpo/bower_components/ace-builds/src/mode-dart.js",
                "carpo/bower_components/ace-builds/src/mode-c_cpp.js",
                "carpo/bower_components/ace-builds/src/mode-golang.js",
                "carpo/bower_components/ace-builds/src/mode-haskell.js",
                "carpo/bower_components/ace-builds/src/mode-html.js",
                "carpo/bower_components/ace-builds/src/mode-java.js",
                "carpo/bower_components/ace-builds/src/mode-json.js",
                "carpo/bower_components/ace-builds/src/mode-makefile.js",
                "carpo/bower_components/ace-builds/src/mode-python.js",
                "carpo/bower_components/ace-builds/src/mode-sh.js",
                "carpo/bower_components/ace-builds/src/mode-sql.js",
                "carpo/bower_components/ace-builds/src/mode-text.js",
                "carpo/bower_components/ace-builds/src/mode-xml.js",
                "carpo/bower_components/ace-builds/src/mode-yaml.js",
                "carpo/bower_components/ace-builds/src/mode-javascript.js"
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


    construct : function(config)
    {
      this.base(arguments);
      this._openeditors = {};
      this.setContentPadding(0,0,0,0);
      this._config = config;
    },
    members: {
        openEditor : function (path, title, content, filemode) {
            if (this._openeditors[path]) {
                this.setSelection(new Array(this._openeditors[path]));
            } else {
                var page = new carpo.Editor(path, title, content, filemode, this._config);
                page.addListener ("close", function (evt) {
                    this.editorClosed (evt.getTarget());
                }, this);
                this._openeditors[path] = page;
                this.add(page);
                this.setSelection(new Array(page));
            }
        },
        editorClosed : function (page) {
            // check if dirty and ask to save ...
            this._openeditors[page.getFilepath()] = null;
        },
        
        getCurrentEditor : function () {
            return this.getSelection()[0];
        },
        
        configChanged : function (config) {
            this._config = config;
            for (var ek in this._openeditors) {
                var ed = this._openeditors[ek];
                ed.configChanged (config);
            }
        }
    }
});