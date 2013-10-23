'use strict';

describe('Service: Workspaceservice', function () {

  // load the service's module
  beforeEach(module('HtmlApp'));

  // instantiate service
  var Workspaceservice;
  beforeEach(inject(function (_Workspaceservice_) {
    Workspaceservice = _Workspaceservice_;
  }));

  it('should do something', function () {
    expect(!!Workspaceservice).toBe(true);
  });

});
