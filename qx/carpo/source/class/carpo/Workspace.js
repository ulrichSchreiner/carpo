qx.Class.define("carpo.Workspace",
{
  extend : qx.core.Object,
  members :
  {
      dir : function (pt) {
        var d = new qx.io.rest.Resource();
        d.map("dir", "GET", "/workspace/dir");
        d.configureRequest(function(req) {
            req.setRequestHeader("Content-Type", "application/json");
        });
        d.addListener("success", function(e) {
            console.log(e.getData());
            this.debug(e.getData());
        }, this);
        //d.dir({},"path="+pt);
        d.dir({},{path:pt});
      }
  }
});