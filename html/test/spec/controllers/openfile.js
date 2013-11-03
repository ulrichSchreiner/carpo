'use strict';

describe('Controller: OpenfileCtrl', function () {

  // load the controller's module
  beforeEach(module('htmlApp'));

  var OpenfileCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    OpenfileCtrl = $controller('OpenfileCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
