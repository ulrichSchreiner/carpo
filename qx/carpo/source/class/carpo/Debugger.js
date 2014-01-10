qx.Class.define("carpo.Debugger", {
  extend : qx.core.Object,
  construct : function(app) {
    this._sessions = {};
    this._app = app;
  },
  members : {
    setConfig : function (cfg) {
      this._debugConfig = cfg.debugger;
      this._breakpoints = cfg.debugger.breakpoints;
    },
    addBreakpoint : function (src, line) {
      var bp = {
        source : src,
        line : line
      };
      if (!this._breakpoints[src]) {
        this._breakpoints[src] = [bp];
      } else {
        this._breakpoints[src].push(bp);
      }
      this._app.saveConfig();
    },
    removeBreakpoint : function (src, line) {
      var bps = this._breakpoints[src];
      if (bps) {
        for (var i=0; i<bps.length; i++) {
          var bp = bps[i];
          if (bp.line == line) {
            bps.splice(i, 1);
            return;
          }
        }
      this._app.saveConfig();
      }
    },
    getBreakpoints : function () {
      return this._breakpoints;
    },
    setBreakpoints : function (bps) {
      this._breakpoints = bps;
    },
    addSession : function (sid) {
      var s = new carpo.DebugSession(this, sid);
      this._sessions[sid] = s;
      return s;
    },
    
    removeSession : function (sess) {
      delete(this._sessions[sess.id]);
    }
  }
});
