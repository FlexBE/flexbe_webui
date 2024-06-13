ROS.ActionClient = function(topicIn, action_typeIn) {

	var that = this;
	var topic = topicIn;
	var action_type = action_typeIn;
	T.logInfo("Create action client for '" + topic + "( " + action_type + ") ... ");

	var dict = {};
	dict['topic'] = topic;
	dict['action_type'] = action_type;
	API.post('create_action_client', dict, (result) => {
		if (result) {
			T.logInfo("Created action client for '" + topic + "' ( " + action_type + ") -- " + result);
		} else {
			T.logError("Failed to create action client for '" + topic + "' !");
		}
	});
	
	that.send_goal = function(data, result_cb, feedback_cb, timeout, timeout_cb) {
		// NOTE: for now feedback_cb and timeout is ignored!
		T.logInfo("Post action goal request for '" + topic + "( " + action_type + ") ... ");
		var message = data || {};
		var dict2 = {};
		dict2['goal'] = message;
		dict2['topic'] = topic;
		console.log(dict2);
		console.log("ready to post to send_action_goal ...");
		API.post('send_action_goal', dict2, (result) => {
			// console.log("send_action_goal - result:");
			if (result.success) {
				console.log("Got result from action client");
				//console.log(result.result);
				try {
					var [obj, idx] = json_parse_raw(result.result);
					if (obj == null) obj = undefined;
					if (idx != 0) {
						try_parse = true;
						result_cb(obj);
					}
					
					if (idx != result.result.length) {
						console.log("  parse raw idx=" + idx + " len=" + result.result.length);
					}
				} catch (err) {
					T.logError("Error retrieving data for '" + topic +"' (" + action_type + ") ...");
					try_parse = false;
					console.log('[Action:'+topic+'] Error:');
					console.log(err);
				}
			} else {
				console.log("Failed to get result for topic '" + topic + "'");
				console.log(JSON.stringify(result));
				T.logError("Goal for '" + topic + "' - failed!");
				result_cb(undefined); // process undefined result to cancel
			}

		});
	}

	that.close = function() {
		T.logInfo("Closing existing action client for '" + topic + "'");
	}
};
