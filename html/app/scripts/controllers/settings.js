'use strict';

angular.module('htmlApp')
  .controller('EditorSettingsCtrl', function ($scope,$modalInstance,config) {
	$scope.data = {
		fontSize:config.fontSize,
		hidefiles:config.hidefiles
	};


	$scope.ok = function () {
	  $modalInstance.close($scope.data);
	};

	$scope.cancel = function () {
	  $modalInstance.dismiss('cancel');
	};
  })
  .controller('ToolsSettingsCtrl', function ($scope,$modalInstance,config) {
    $scope.apptypes = {
        go:"Standard Go",
        goapp:"Appengine"
    };
	$scope.data = {
        go:config.go,
        goapp:config.goapp,
        apptype:config.apptype
	};


	$scope.ok = function () {
        console.log($scope.data);
	    $modalInstance.close($scope.data);
	};

	$scope.cancel = function () {
	  $modalInstance.dismiss('cancel');
	};
  })
;
