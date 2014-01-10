qx.Class.define("carpo.DebugSession", {
  extend : qx.core.Object,
  events : {
    "consoleOutput"   : "qx.event.type.Data"
  },
  construct : function(dbg, id) {
    this.id = id;
    this.debugger = dbg;
  },
  members : {
    message : function (msg) {
      var e = qx.lang.Json.parse(msg);
      var f = this["on_"+e.debuggerEvent];
      if (f) {
        f = qx.lang.Function.bind(f, this);
        f(e);
      }
    },
    on_async : function (e) {
      var aevent = e.event;
      console.log("async:",aevent);
    },
    on_console : function (e) {
      var cevent = e.console;
      this.fireDataEvent("consoleOutput", cevent);
    }
  }
});
