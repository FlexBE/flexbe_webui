ROS.Subscriber = function(topicIn, msg_typeIn, callback) {
	var that = this;

	var msg_type = msg_typeIn;
	var topic = topicIn;

	const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
	const wsHost = window.location.host;
	const ws = new WebSocket(`${wsProto}//${wsHost}/ws/${topic.replaceAll('/', '-')}`);

	ws.onopen = (event) => {
		// console.log("On open for " + topic + "(" + msg_type + ") ...");
		var dict = {};
		dict['topic'] = topic;
		dict['msg_type'] = msg_type;
		API.postFlag('create_subscriber', dict, () => {
				T.logInfo("Created subscriber for '" + topic +"' (" + msg_type + ") at " + wsProto + "//" + wsHost);
			}, error => {
				T.logWarn("Failed to create subscriber for '" + topic +"' (" + msg_type + ")");
				T.logInfo(error);
			});
	};

	var buffer = "";
	ws.onmessage = function(event){
		var data = event.data;
		buffer += data;
		var try_parse = true;
		while (try_parse) {
			try_parse = false;
			try {
				var [obj, idx] = json_parse_raw(buffer);

				if (obj == null) obj = undefined;
				if (idx != 0) {
					var exec_cb = function(o) { setTimeout(function() { callback(o); }, 0); };
					buffer = buffer.slice(idx);
					try_parse = true;
					exec_cb(obj);
				}
			} catch (err) {
				T.logInfo("Error retrieving subscription data for '" + topic +"' (" + msg_type + ") ...");
				try_parse = false;
				console.log('[SUB:'+topic+'] Error:');
				console.log(err);
				console.log('event.data <' + JSON.stringify(event.data) + '>');
				console.log('buffer:<' + buffer + '>' + idx);
				if (err.hasOwnProperty('name') && err.name == "SyntaxError" && err.hasOwnProperty('at')) {
					buffer = buffer.slice(err.at);
					try_parse = true;
				}
			}
		}

	}

	that.close = function() {
		console.log(`\x1b[91mOn close for subscription to '${topic}' (${msg_type}) ...\x1b[0m`);
		ws.close();
		API.postFlag('close_subscriber', topic, () => {
				console.log(`\x1b[91mClosed subscriber for '${topic}' \x1b[0m`);
			}, error => {
				T.logError("Failed to close subscriber for '" + topic + "' ( " + msg_type + ") ");
				T.logInfo(error);
			});
	}

};
