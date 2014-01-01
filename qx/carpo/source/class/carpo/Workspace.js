qx.Class.define("carpo.Workspace",
{
  extend : qx.core.Object,
  members : {
    __getresource : function (act, httpAction, path, cb,errcb,ct) {
      var d = new qx.io.rest.Resource();
      d.map(act, httpAction, path);
      if (!ct)
          ct = "application/json";
      d.configureRequest(function(req) {
          req.setRequestHeader("Content-Type", ct);
          req.setRequestHeader("Accept","*/*");
      });
      d.addListener("success", function(e) {
          if (cb)
            cb(e.getData());
      }, this);
      d.addListener("error", function(e) {
          if (errcb)
              errcb(e);
      }, this);
      return d;
    },
    killproc : function (pid, cb) {
      var d = this.__getresource("kill","GET","/workspace/process/{pid}/kill", cb);
      d.kill({pid:pid});
    },
    dir : function (pt, cb) {
      var d = this.__getresource("dir","GET","/workspace/dir", cb);
      d.dir({},"path="+pt);
    },
    
    loadconfig : function (cb,errcb) {
      var d = this.__getresource("get","GET","/workspace/config", cb,errcb);
      d.get();
    },
    
    loadEnvironment : function (cb,errcb) {
      var d = this.__getresource("get","GET","/workspace/environment", cb,errcb);
      d.get();
    },
    saveconfig : function (data, cb, errcb) {
      var d = this.__getresource("post","POST","/workspace/config", cb,errcb);
      d.post({}, data);          
    },
    
    loadFile : function (pt, cb) {
        var d  =this.__getresource("get","GET","/workspace/file", cb);
        d.get({},"path="+pt);
    },
    
    saveFile : function (pt, data, cb) {
        var d  =this.__getresource("post","POST","/workspace/file", cb);
        d.post({}, data);
    },
    
    build : function (cfg, cb) {
        var d = this.__getresource("post","POST","/workspace/build", cb);
        d.post({}, cfg);
    },
    createdir : function (pt, cb) {
      var d = this.__getresource("get","GET","/workspace/mkdir", cb);
      d.get({},"path="+pt);
    },
    createfile : function (pt, cb) {
      var d = this.__getresource("get","GET","/workspace/touch", cb);
      d.get({},"path="+pt);
    },
    rm : function (pt, cb) {
      var d = this.__getresource("get","GET","/workspace/rm", cb);
      d.get({},"path="+pt);
    },
    exit : function (cb) {
      var d = this.__getresource("get","GET","/workspace/exit", cb);
      d.get();
    },
    autocomplete : function (data, cb) {
      var d  = this.__getresource("post","POST","/workspace/autocomplete", cb);
      d.post({}, data);
    },
    installgocode : function (cb,errcb) {
      var d = this.__getresource("get","GET","/workspace/install/gocode", cb, errcb);
      d.get();
    }
  }
});
