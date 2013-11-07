'use strict';

angular.module('htmlApp')
  .controller('CreatefileElementCtrl', function ($scope,$modalInstance,elementType,parentDir) {
	$scope.data = {
		elementName : null,
		elementType : elementType,
		parentDir : parentDir
	};


	$scope.ok = function () {
	  $modalInstance.close($scope.data.elementName);
	};

	$scope.cancel = function () {
	  $modalInstance.dismiss('cancel');
	};
  });
