'use strict';

describe('Controller: CreatefileelementCtrl', function () {

  // load the controller's module
  beforeEach(module('htmlApp'));

  var CreatefileelementCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    CreatefileelementCtrl = $controller('CreatefileelementCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
