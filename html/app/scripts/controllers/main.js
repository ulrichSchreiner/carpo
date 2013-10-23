'use strict';

angular.module('htmlApp')
  .controller('MainCtrl', function ($scope,Workspaceservice) {
    $scope.awesomeThings = [
      'HTML5 Boilerplate',
      'AngularJS',
      'Karma'
    ];
    var handler = {
    	open : function(e) {
    		console.log("on open");
    	},
    	error : function(e) {
    		console.log("on error");
    	},
    	message : function(e) {
    		console.log("on message");
    	}
    }
    Workspaceservice.subscribe(handler);
    Workspaceservice.connect();
  });
