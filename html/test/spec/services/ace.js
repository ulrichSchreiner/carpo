'use strict';

describe('Service: Ace', function () {

  // load the service's module
  beforeEach(module('HtmlApp'));

  // instantiate service
  var Ace;
  beforeEach(inject(function (_Ace_) {
    Ace = _Ace_;
  }));

  it('should do something', function () {
    expect(!!Ace).toBe(true);
  });

});
