qx.Class.define("carpo.Workspace",
{
  extend : qx.core.Object,
  construct : function (stat) {
    this.status = stat;
  },
  members : {
    __getresource : function (act, httpAction, path, cb,errcb,ct,silent) {
      if (!silent)
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
        if (!silent)
          self.status.showStatusMessage("Ok!", false);
        if (cb)
          cb(e.getData());
      }, this);
      d.addListener("error", function(e) {
        if (!silent)
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
    dir : function (fs,pt, cb) {
      var d = this.__getresource("dir","POST","/workspace/dir", cb);
      var data = {filesystem:fs,path:pt}
      d.dir({},data);
    },
    
    loadconfig : function (cb,errcb) {
      var d = this.__getresource("loadconfig","GET","/workspace/config", cb,errcb);
      d.loadconfig();
    },

    resetWorkspace : function (cb,errcb) {
      var d = this.__getresource("resetWS","GET","/workspace/reset", cb,errcb,null,true);
      d.resetWS();
    },
    
    loadEnvironment : function (cb,errcb) {
      var d = this.__getresource("loadEnvironment","GET","/workspace/environment", cb,errcb);
      d.loadEnvironment();
    },
    saveconfig : function (data, cb, errcb) {
      var d = this.__getresource("saveconfig","POST","/workspace/config", cb,errcb);
      d.saveconfig({}, data);          
    },
    
    loadFile : function (fs, pt, cb, err) {
        var d  =this.__getresource("loadFile","POST","/workspace/readfile", cb,err);
        var data = {filesystem:fs, path:pt};
        d.loadFile({},data);
    },
    
    saveFile : function (fs, pt, data, cb) {
        var d  =this.__getresource("saveFile","POST","/workspace/savefile", cb);
        data.filesystem = fs;
        d.saveFile({}, data);
    },
    
    build : function (cfg, cb) {
        var d = this.__getresource("build","POST","/workspace/build", cb);
        d.build({}, cfg);
    },
    createdir : function (fs, pt, cb) {
      var d = this.__getresource("createdir","POST","/workspace/mkdir", cb);
      var data = {filesystem:fs, path:pt};
      d.createdir({},data);
    },
    createfile : function (fs, pt, cb) {
      var d = this.__getresource("createfile","POST","/workspace/touch", cb);
      var data = {filesystem:fs, path:pt};
      d.createfile({},data);
    },
    rm : function (fs, pt, cb) {
      var d = this.__getresource("rm","POST","/workspace/rm", cb);
      var data = {filesystem:fs, path:pt};
      d.rm({},data);
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
    },
    template : function (data, cb) {
      var d  = this.__getresource("template","POST","/workspace/wizard/template", cb);
      d.template({}, data);
    },
    parseSource : function (data, cb, errcb) {
      var d  = this.__getresource("parsesource","POST","/workspace/parseSource", cb, errcb);
      d.parsesource({}, data);
    },
    openType : function (data, cb, errcb) {
      var d  = this.__getresource("openType","POST","/workspace/opentype", cb, errcb);
      d.openType({}, data);
    }
    
  }
});
