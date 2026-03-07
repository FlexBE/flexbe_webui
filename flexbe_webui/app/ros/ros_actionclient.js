ROS.ActionClient = function(topicIn, action_typeIn) {

	var that = this;
	var topic = topicIn;
	var action_type = action_typeIn;
	T.logInfo("Create action client for '" + topic + "( " + action_type + ") ... ");

	var dict = {};
	dict['topic'] = topic;
	dict['action_type'] = action_type;
	API.postFlag('create_action_client', dict, () => {
			T.logInfo("Created action client for '" + topic + "' ( " + action_type + ") ");
		}, error => {
			T.logError("Failed to create action client for '" + topic + "' !");
			T.logInfo(error);
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
			API.postData('send_action_goal', dict2, (result_data) => {
				// console.log("send_action_goal - result:");
				if (result_data.goal_succeeded) {
					console.log("Got result from action client");
					//console.log(result.result);
					try {
					var [obj, idx] = json_parse_raw(result_data.result);
					if (obj == null) obj = undefined;
					if (idx != 0) {
						result_cb(obj);
					}
					
					if (idx != result_data.result.length) {
						console.log("  parse raw idx=" + idx + " len=" + result_data.result.length);
					}
				} catch (err) {
					T.logError("Error retrieving data for '" + topic +"' (" + action_type + ") ...");
					console.log('[Action:'+topic+'] Error:');
					console.log(err);
				}
				} else {
					console.log("Failed to get result for topic '" + topic + "'");
					console.log(JSON.stringify(result_data));
					T.logError("Goal for '" + topic + "' - failed!");
					T.logInfo(result_data.reason || "request failed");
					result_cb(undefined); // process undefined result to cancel
				}

		}, error => {
			console.log("Failed to get result for topic '" + topic + "'");
			T.logError("Goal for '" + topic + "' - failed!");
			T.logInfo(error);
			result_cb(undefined);
		});
	}

	that.close = function() {
		T.logInfo("Closing existing action client for '" + topic + "'");
	}
};
