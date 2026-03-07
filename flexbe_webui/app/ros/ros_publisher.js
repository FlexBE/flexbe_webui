ROS.Publisher = function(topicIn, msg_typeIn, latched=false) {
	var that = this;
	var LATCHED = latched;
	var topic = topicIn;
	var msg_type = msg_typeIn;
	// console.log("Create publisher '" + topic + "' ( " + msg_type + ") ... ");

	var dict = {};
	dict['topic'] = topic;
	dict['msg_type'] = msg_type;
	dict['latched'] = LATCHED;
	API.postFlag('create_publisher', dict, () => {
			T.logInfo("Created publisher for '" + topic + "' ( " + msg_type + ") ");
		}, error => {
			T.logError("Failed to create publisher for '" + topic + "' ( " + msg_type + ") ");
			T.logInfo(error);
		});


	that.publish = function(data) {
		// console.log("Post publish request for '" + topic + "' ( " + msg_type + ") ... ");
		let message = data || {};
		var dict2 = {'req': message, 'topic': topic};
		API.postFlag('publish', dict2, () => {}, error => {
			T.logError("Failed to publish message for '" + topic + "'!");
			T.logInfo(error);
		});

	}

	that.close = function() {
		console.log(`\x1b[91mRequest close for publisher to '${topic}' (${msg_type}) ...\x1b[0m`);
		API.postFlag('close_publisher', topic, () => {
				console.log(`\x1b[91mClosed publisher for '${topic}' \x1b[0m`);
			}, error => {
				T.logError("Failed to create publisher for '" + topic + "' ( " + msg_type + ") ");
				T.logInfo(error);
			});
	}


};
