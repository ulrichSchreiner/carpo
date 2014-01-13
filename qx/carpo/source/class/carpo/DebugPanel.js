/**
 * thanks to adam whitcroft (http://adamwhitcroft.com/batch/) for his icons
 * 
 * @asset(carpo/debug/16/*)
 */
qx.Class.define("carpo.DebugPanel", {
    extend : qx.ui.container.Composite,
    properties : {
      "debugSession" : { init: null, nullable:true, event: "changeDebugSession" }
    },
    events : {
    },
    
    construct : function(dbg, app, workspace) {
      this.base(arguments);
      this.setDebugSession(null);
      this.debugger = dbg;
      
      this.createCommands ();
      this.setLayout(new qx.ui.layout.VBox());
      var toolbar = new qx.ui.toolbar.ToolBar();
      toolbar.setSpacing(5);
      var conv = {
        converter : function (s) {
          return s !== null;
        }
      };
      var runButton = new qx.ui.form.Button(null,"carpo/debug/16/play.png", this._run);
      var pauseButton = new qx.ui.form.Button(null,"carpo/debug/16/pause.png", this._pause);
      var siButton = new qx.ui.form.Button(null,"carpo/debug/16/arrow-down.png", this._stepinto);
      var soButton = new qx.ui.form.Button(null,"carpo/debug/16/arrow-right.png", this._stepover);
      var soutButton = new qx.ui.form.Button(null,"carpo/debug/16/arrow-up.png", this._stepout);

      toolbar.add(runButton);
      toolbar.add(pauseButton);
      toolbar.add(siButton);
      toolbar.add(soButton);
      toolbar.add(soutButton);
      
      this.add (toolbar);
    },
    members : {
      createCommands : function () {
        this._run = new qx.ui.core.Command();
        this._run.addListener("execute", this.step_run, this);
        this._run.set({enabled:false});
        this._pause = new qx.ui.core.Command();
        this._pause.addListener("execute", this.step_pause, this);
        this._pause.set({enabled:false});
        this._stepinto = new qx.ui.core.Command();
        this._stepinto.addListener("execute", this.step_stepinto, this);
        this._stepinto.set({enabled:false});
        this._stepover = new qx.ui.core.Command();
        this._stepover.addListener("execute", this.step_stepover, this);
        this._stepover.set({enabled:false});
        this._stepout = new qx.ui.core.Command();
        this._stepout.addListener("execute", this.step_stepout, this);
        this._stepout.set({enabled:false});
      },
      step_run : function () {
      },
      
      step_pause : function () {
      },
      
      step_stepinto : function () {
      },
      
      step_stepover : function () {
      },
      
      step_stepout : function () {
      },
      
      setCurrentSession : function (s) {
        var old = this.getDebugSession();
        if (old) {
          old.removeListenerById(this._listenerid);
        }
        if (s === null) {
          this.setDebugSession(null);
          return;
        }
        this.setDebugSession(s);
        this._listenerid = s.addListener("debugEvent", this.onDebuggerEvent, this);
      },
      
      onDebuggerEvent : function (e) {
        switch(e.getData().typeName) {
          case "running": 
            this.onRunning(e);
            break;
          case "stopped":
            this.onStopped(e);
            break;
        }
      },
      
      onRunning : function (e) {
        this._pause.setEnabled(true);
      },
      onStopped : function (e) {
        this._pause.setEnabled(false);
      }
    }
});