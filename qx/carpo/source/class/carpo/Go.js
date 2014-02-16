qx.Class.define("carpo.Go",
{
  extend : qx.core.Object,
  construct : function(code) {
    this.code = code;
  },
  statics : {
    getFuncSignatureWithoutReturn : function (signature) {
      var idx = signature.indexOf(")");
      return signature.substring(0,idx+1);
    },
    getFuncParamList : function (prefix,sig,methname) {
      var idx = sig.indexOf(")");
      var parms = sig.substring(prefix.length+1,idx);
      var tupels = parms.split(",");
      var res = methname+"(";
      var paramlen = 0;
      for (var i=0, t; t = tupels[i]; i++) {
        t = t.replace(/(^\s+|\s+$)/g,'');
        var pname = t.split(" ");
        if (i === 0) {
          paramlen = pname[0].length;
        }
        res = res + pname[0];
        if (i < tupels.length-1) {
          res = res +", ";
        }
      }
      res = res + ")";
      return {
        text:res,
        len:methname.length+1,
        paramlen: paramlen
      };
    }
  },
  members : {
    addImport : function (editor, ipath) {
      var curpos = editor.getCursorPosition();
      var range = editor.find("import (");
      if (range) {
        editor.replace("import (\n\t\""+ipath+"\"",{start:{row:0,col:0}});
      } else {
        var pos = {row:1,column:0};
        editor.getSession().insert(pos, "import (\n\t\""+ipath+"\")\n");
      }
      editor.clearSelection();
      editor.gotoLine(curpos.row+2,curpos.column,false);
      //curpos.row = curpos.row+1;
      //editor.moveCursorToPosition(curpos);
      editor.scrollToLine(curpos.row+2, true, false, function() {});
    }

  }
});