'use strict';

describe('Controller: ToolsCtrl', function () {

  // load the controller's module
  beforeEach(module('htmlApp'));

  var ToolsCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    ToolsCtrl = $controller('ToolsCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
