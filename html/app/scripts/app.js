'use strict';

angular.module('htmlApp', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ui.ace',
  'ui.keypress',
  'ui.bootstrap',
  'snap'
])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });
  });
