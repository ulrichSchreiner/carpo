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
    "debugEvent" : "qx.event.type.Data",
    "debugDataEvent" : "qx.event.type.Data"
  },
  construct : function(dbg, lc, output, debug, defaultname, name ) {
    this.base(arguments);
    this.debugger = dbg;
    this.setLaunchconfig(lc);
    this.setOutput(output);
    this.setDebug(debug);
    this.setDefaultname(defaultname);
    this.setName(name);
    this._running = true;
  },
  members : {
    stop : function (wkService) {
      if (this.getDebug()) {
        this.quitDebugSession();
        this._running = false;
      } else {
        if (this.getPid() !== "") {
          wkService.killproc(this.getPid());
          this._running = false;
        }
      }
    },
    
    isRunning : function () {
      return this._running;
    },
    
    send : function (msg) {
      var srv = this.getService();
      srv.console.send(qx.lang.Json.stringify(msg));
    },
    quitDebugSession : function () {
      var cmd = {
        command : "quit",
        data : []
      };
      this.send(cmd);
    },
    addBreakpoint : function (bp) {
      var cmd = {
        command : "add-breakpoint",
        data : bp
      };
      this.send(cmd);
    },
    removeBreakpoint : function (bp) {
      var cmd = {
        command : "remove-breakpoint",
        data : bp
      };
      this.send(cmd);
    },
    message : function (msg) {
      //console.log("MESSAGE:",msg);
      var e = qx.lang.Json.parse(msg);
      var f = this["on_"+e.debuggerEvent];
      if (f) {
        f = qx.lang.Function.bind(f, this);
        f(e);
      }
    },
    close : function () {
      this.fireDataEvent ("debugEvent", {typeName:"close"});
    },
    on_async : function (e) {
      var aevent = e.event;
      //console.log("async:",aevent,this);
      this.fireDataEvent("debugEvent", aevent);
    },
    on_data : function (e) {
      this.fireDataEvent("debugDataEvent", e.data);
    }
  }
});
