'use strict';

angular.module('htmlApp')
  .provider('ace', function () {

    // Method for instantiating
    this.$get = function () {
      return window.ace;
    };
  });
