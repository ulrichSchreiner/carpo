qx.Class.define("carpo.Debugger", {
  extend : qx.core.Object,
  construct : function(app) {
    this._sessions = {};
    this._app = app;
    this._currentPos = null;
  },
  members : {
    gotoLine : function (fs, path, line) {
      if (this._currentPos) {
        this._app.openFileAtLine(this._currentPos.filesystem, this._currentPos.path, -1);
      }
      if (fs) {
        this._currentPos = {filesystem:fs, path:path, line:line};
        this._app.openFileAtLine(fs, path, line);
      } else {
        this._currentPos = null;
      }
    },
    
    setConfig : function (cfg) {
      this._debugConfig = cfg.debugger;
      this._breakpoints = cfg.debugger.breakpoints;
    },
    addBreakpoint : function (fs, src, line, dontsave) {
      var bp = {
        filesystem : fs,
        source : src,
        line : line 
      };
      var key = fs+src;
      if (!this._breakpoints[key]) {
        this._breakpoints[key] = [bp];
      } else {
        this._breakpoints[key].push(bp);
      }
      for (var k in this._sessions) {
        var s = this._sessions[k];
        s.addBreakpoint(bp);
      }
      if (!dontsave)
        this._app.saveConfig();
    },
    removeBreakpoint : function (fs, src, line, dontsave) {
      var key = fs+src;
      var removeBp = {
        filesystem : fs, source: src, line:line
      };
      for (var k in this._sessions) {
        var s = this._sessions[k];
        s.removeBreakpoint(removeBp);
      }
      var bps = this._breakpoints[key];
      if (bps) {
        for (var i=0; i<bps.length; i++) {
          var bp = bps[i];
          if (bp.line == line) {
            bps.splice(i, 1);
            break;
          }
        }
        if (bps.length === 0)
          delete this._breakpoints[key];
        if (!dontsave)
          this._app.saveConfig();
      }
    },
    getBreakpoints : function () {
      return this._breakpoints;
    },
    getBreakpointsFor : function (fs, src) {
      var key = fs+src;
      return this._breakpoints[key];
    },
    setBreakpoints : function (bps) {
      this._breakpoints = bps;
    },
    addSession : function (s) {
      this._sessions[s.getPid()] = s;
      return s;
    },
    
    removeSession : function (sess) {
      delete(this._sessions[sess.getPid()]);
    },
    
    getSession : function (sid) {
      return this._sessions[sid];
    },
    
    _sendCommand : function (service, cmd) {
      service.console.send(qx.lang.Json.stringify(cmd));
    },
    cmd_run : function (service) {
      var cmd = {command:"continue",params:{}};
      this._sendCommand(service, cmd);
    },
    cmd_next : function (service) {
      var cmd = {command:"next",params:{}};
      this._sendCommand(service, cmd);
    },
    cmd_step : function (service) {
      var cmd = {command:"step",params:{}};
      this._sendCommand(service, cmd);
    },
    cmd_return : function (service) {
      var cmd = {command:"return",params:{}};
      this._sendCommand(service, cmd);
    },
    cmd_state : function (service) {
      var cmd = {command:"state",params:{}};
      this._sendCommand(service, cmd);
    },
    cmd_getBreakpointInfo : function (service) {
      var cmd = {command:"breakpointInfo",params:{}};
      this._sendCommand(service, cmd);
    }
  }
});
