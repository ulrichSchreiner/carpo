qx.Class.define("carpo.DebugSession", {
  extend : qx.core.Object,
  properties : {
        launchconfig: { init: null },
        pid: { init: null },
        output: {init: null,event: "changeOutput"},
        debug: {init: false},
        defaultname: {init: null},
        name: {init: null,event: "changeName" },
        service: {init: null}
  },
  events : {
    "consoleOutput"   : "qx.event.type.Data",
    "debugEvent" : "qx.event.type.Data"
  },
  construct : function(dbg, lc, output, debug, defaultname, name ) {
    this.base(arguments);
    this.debugger = dbg;
    this.setLaunchconfig(lc);
    this.setOutput(output);
    this.setDebug(debug);
    this.setDefaultname(defaultname);
    this.setName(name);
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
      console.log("async:",aevent,this);
      this.fireDataEvent("debugEvent", aevent);
    },
    on_console : function (e) {
      var cevent = e.console;
      this.fireDataEvent("consoleOutput", cevent);
    }
  }
});
