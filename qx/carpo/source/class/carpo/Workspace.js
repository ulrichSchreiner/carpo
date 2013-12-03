qx.Class.define("carpo.Workspace",
{
  extend : qx.core.Object,
  members :
  {
      __getresource : function (act, httpAction, path, cb) {
        var d = new qx.io.rest.Resource();
        d.map(act, httpAction, path);
        d.configureRequest(function(req) {
            req.setRequestHeader("Content-Type", "application/json");
        });
        d.addListener("success", function(e) {
            if (cb)
              cb(e.getData());
        }, this);
        return d;
      },
      dir : function (pt, cb) {
        var d = this.__getresource("dir","GET","/workspace/dir", cb);
        d.dir({},"path="+pt);
      },
      
      loadconfig : function (cb) {
        var d = this.__getresource("get","GET","/workspace/config", cb);
        d.get();
      },
      
      loadFile : function (pt, cb) {
          var d  =this.__getresource("get","GET","/workspace/file", cb);
          d.get({},"path="+pt);
      }
  }
});