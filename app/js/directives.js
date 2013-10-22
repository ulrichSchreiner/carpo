'use strict';

/* Directives */


angular.module('carpo.directives', []).
  directive('carpoVersion', ['version', function(version) {
    return function(scope, elm, attrs) {
      elm.text(version);
    };
  }]);