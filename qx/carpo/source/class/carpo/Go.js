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
    }
  },
  members : {
    addImport : function (editor, ipath) {
      var curpos = editor.getCursorPosition();
      var range = editor.find("import (");
      if (range) {
        editor.replace("import (\n\t\""+ipath+"\"");
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