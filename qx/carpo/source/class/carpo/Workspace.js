qx.Class.define("carpo.Workspace",
{
  extend : qx.core.Object,
  construct : function (stat) {
    this.status = stat;
  },
  members : {
    __getresource : function (act, httpAction, path, cb,errcb,ct) {
      this.status.showStatusMessage ("waiting <code>"+act+"</code> ...", true);
      var d = new qx.io.rest.Resource();
      var self = this;
      d.map(act, httpAction, path);
      if (!ct)
          ct = "application/json";
      d.configureRequest(function(req) {
          req.setRequestHeader("Content-Type", ct);
          req.setRequestHeader("Accept","*/*");
      });
      d.addListener("success", function(e) {
          self.status.showStatusMessage("Ok!", false);
          if (cb)
            cb(e.getData());
      }, this);
      d.addListener("error", function(e) {
          self.status.showStatusMessage("Error!", false);
          if (errcb)
              errcb(e);
      }, this);
      return d;
    },
    killproc : function (pid, cb) {
      var d = this.__getresource("kill","GET","/workspace/process/{pid}/kill", cb);
      d.kill({pid:pid});
    },
    installPackage : function (pkg, cb) {
      var d = this.__getresource("install","GET","/workspace/install/package", cb);
      d.install({},"pkg="+pkg);
    },
    dir : function (pt, cb) {
      var d = this.__getresource("dir","GET","/workspace/dir", cb);
      d.dir({},"path="+pt);
    },
    
    loadconfig : function (cb,errcb) {
      var d = this.__getresource("loadconfig","GET","/workspace/config", cb,errcb);
      d.loadconfig();
    },
    
    loadEnvironment : function (cb,errcb) {
      var d = this.__getresource("loadEnvironment","GET","/workspace/environment", cb,errcb);
      d.loadEnvironment();
    },
    saveconfig : function (data, cb, errcb) {
      var d = this.__getresource("saveconfig","POST","/workspace/config", cb,errcb);
      d.saveconfig({}, data);          
    },
    
    loadFile : function (pt, cb) {
        var d  =this.__getresource("loadFile","GET","/workspace/file", cb);
        d.loadFile({},"path="+pt);
    },
    
    saveFile : function (pt, data, cb) {
        var d  =this.__getresource("saveFile","POST","/workspace/file", cb);
        d.saveFile({}, data);
    },
    
    build : function (cfg, cb) {
        var d = this.__getresource("build","POST","/workspace/build", cb);
        d.build({}, cfg);
    },
    createdir : function (pt, cb) {
      var d = this.__getresource("createdir","GET","/workspace/mkdir", cb);
      d.createdir({},"path="+pt);
    },
    createfile : function (pt, cb) {
      var d = this.__getresource("createfile","GET","/workspace/touch", cb);
      d.createfile({},"path="+pt);
    },
    rm : function (pt, cb) {
      var d = this.__getresource("rm","GET","/workspace/rm", cb);
      d.rm({},"path="+pt);
    },
    exit : function (cb) {
      var d = this.__getresource("exit","GET","/workspace/exit", cb);
      d.exit();
    },
    autocomplete : function (data, cb) {
      var d  = this.__getresource("autocomplete","POST","/workspace/autocomplete", cb);
      d.autocomplete({}, data);
    },
    installgocode : function (cb,errcb) {
      var d = this.__getresource("installgocode","GET","/workspace/install/gocode", cb, errcb);
      d.installgocode();
    },
    queryPackages : function (cb,errcb) {
      var d = this.__getresource("queryPackages","GET","/workspace/querypackages", cb, errcb);
      d.queryPackages();
    },
    queryRemotePackages : function (n,cb,errcb) {
      var d = this.__getresource("queryRemotePackages","GET","/workspace/queryremotepackages", cb, errcb);
      d.queryRemotePackages({},"q="+n);
    }
  }
});
