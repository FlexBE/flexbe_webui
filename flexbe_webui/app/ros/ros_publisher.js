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
	API.post('create_publisher', dict, (result) => {
		if (result) {
			T.logInfo("Created publisher for '" + topic + "' ( " + msg_type + ") ");
		} else {
			T.logError("Failed to create publisher for '" + topic + "' ( " + msg_type + ") ");
		}
	});


	that.publish = function(data) {
		// console.log("Post publish request for '" + topic + "' ( " + msg_type + ") ... ");
		message = data || {};
		var dict2 = {'req': message, 'topic': topic};
		API.post('publish', dict2, (result) => {
			if (!result) {
				T.logError("Failed to publish message for '" + topic + "'!");
			}
		});

	}

	that.close = function() {
		console.log(`\x1b[91mRequest close for publisher to '${topic}' (${msg_type}) ...\x1b[0m`);
		API.post('close_publisher', topic, (result) => {
			if (result) {
				console.log(`\x1b[91mClosed publisher for '${topic}' \x1b[0m`);
			} else {
				T.logError("Failed to create publisher for '" + topic + "' ( " + msg_type + ") ");
			}
		});
	}


};
