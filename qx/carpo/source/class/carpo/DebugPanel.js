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
      this.application = app;
      
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

      var data = new qx.ui.tabview.TabView();
      data.setContentPadding(0,0,0,0);
      var locals = new qx.ui.tabview.Page("Locals");
      var callstack = new qx.ui.tabview.Page("Call Stack");
      data.add(locals);
      data.add(callstack);
      
      locals.setLayout(new qx.ui.layout.VBox(0));
      
      this.localsdata = new qx.ui.table.model.Simple();
      var columns = [ "Name","Value" ];
      this.localsdata.setColumns(columns);
      var custom = {
          tableColumnModel : function(obj) {
              return new qx.ui.table.columnmodel.Resize(obj);
          }
      };      
      this.localstable = new qx.ui.table.Table(this.localsdata, custom)
          .set({
              allowGrowX:true,
              allowGrowY:true,
              decorator:"main",
              statusBarVisible:false
              });
      
      this.add (toolbar);
      locals.add(this.localstable,{flex:1});
      
      this.add (data, {flex:1});
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
        this.debugger.cmd_run(this.getDebugSession().getService());
      },
      
      step_pause : function () {
      },
      
      step_stepinto : function () {
        this.debugger.cmd_step(this.getDebugSession().getService());
      },
      
      step_stepover : function () {
        this.debugger.cmd_next(this.getDebugSession().getService());
      },
      
      step_stepout : function () {
        this.debugger.cmd_return(this.getDebugSession().getService());
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
          case "close":
            this.onClose(e);
            break;
        }
      },
      
      onRunning : function (e) {
        this._pause.setEnabled(true);
        this._run.setEnabled(false);
        this._stepinto.setEnabled(false);
        this._stepover.setEnabled(false);
        this._stepout.setEnabled(false);
      },
      onClose : function (e) {
        this._pause.setEnabled(false);
        this._run.setEnabled(false);
        this._stepinto.setEnabled(false);
        this._stepover.setEnabled(false);
        this._stepout.setEnabled(false);
        this.debugger.gotoLine(null);
        this.setCurrentSession(null);
      },
      onStopped : function (e) {
        this._pause.setEnabled(false);
        if (e.getData().stopName === "exited-normally") {
          this._run.setEnabled(false);
          this.debugger.gotoLine(null);
        }
        else {
          this._run.setEnabled(true);
          this._stepinto.setEnabled(true);
          this._stepover.setEnabled(true);
          this._stepout.setEnabled(true);
          var dat = e.getData();
          if (dat && dat.currentStackFrame)
            this.debugger.gotoLine(dat.filesystem, dat.path, dat.currentStackFrame.line);
        }
      }
    }
});