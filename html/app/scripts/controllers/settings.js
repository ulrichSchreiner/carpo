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
  .controller('LibrarySettingsCtrl', function ($scope,$modalInstance) {
	$scope.data = {
	};


	$scope.ok = function () {
	  $modalInstance.close($scope.data);
	};

	$scope.cancel = function () {
	  $modalInstance.dismiss('cancel');
	};
  })
;
