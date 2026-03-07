ROS = new (function() {
	var that = this;

	that.init = function(callback) {
		var ros_namespace;
		API.getData('ros/namespace', namespace => {
			ros_namespace = namespace;
			callback(ros_namespace);
			T.logInfo(`\x1b[92mFlexBE WebUI ROS node is ready at namespace = '${ros_namespace}'.\x1b[0m`);
		}, () => {
			T.logWarn(`\x1b[91mFlexBE WebUI ROS node is not available.\x1b[0m`);
		});
	}

	that.shutdown = function() {
		API.getData('ros/namespace', () => {
			T.logInfo(`\x1b[92mFlexBE WebUI ROS node is still available\x1b[0m`);
		}, () => {
			T.logWarn(`\x1b[91mFlexBE WebUI ROS node is not available!\x1b[0m`);
		});
	}


}) ();
