ROS = new (function() {
	var that = this;

	that.init = function(callback) {
		var ros_namespace;
		API.get('ros/namespace', (result) => {
			try {
				ros_namespace = result;
				callback(ros_namespace);
				T.logInfo(`\x1b[92mFlexBE WebUI ROS node is ready at namespace = '${ros_namespace}'.`);
			} catch (err) {
				T.logWarn(`\x1b[91mFlexBE WebUI ROS node is not available.\x1b[0m`);
			}
		});
	}

	that.shutdown = function() {
		API.get('ros/namespace', (result) => {
			try {
				T.logInfo(`\x1b[92mFlexBE WebUI ROS node is still available\x1b[0m`);
			} catch (err) {
				T.logWarn(`\x1b[91mFlexBE WebUI ROS node is not available!\x1b[0m`);
			}
		});
	}


}) ();
