Synthesis = (typeof Synthesis == 'undefined') ? {} : Synthesis;

Synthesis.Client = new (function() {
	var that = this;
	var action_client;

	var timeoutCallback = function(timeout_cb) {
		UI.Tools.closeSynthesisProgress();
		T.logError('Synthesis timed out! Check if the synthesis server is listening on topic: ' +  UI.Settings.getSynthesisTopic());

		if(timeout_cb != undefined) timeout_cb();
	}

	var feedbackCallback = function(feedback, feedback_cb) {
		console.log('Synthesis status: ' + feedback.status + ' (' + (feedback.progress * 100) + '%)');
		UI.Tools.updateSynthesisProgress(feedback.status);

		if(feedback_cb != undefined) feedback_cb(feedback);
	}

	this.initializeAction = function(ns) {
		console.log("Synthesis.Client - initializeAction");
		var topic = UI.Settings.getSynthesisTopic();
		var action_type = UI.Settings.getSynthesisType();
		if (action_type.endsWith('Action')) action_type = action_type.replace(/Action$/, "");
		if (action_client != undefined) {
			action_client.close();
		}
		action_client = new ROS.ActionClient(topic, action_type);
	}

	this.shutdown = function() {
		if (action_client) action_client.close();
		action_client = undefined;
	}

	this.requestGoal = function(goal_msg, root, result_cb, feedback_cb, timeout_cb, timeout_sec) {
		if (action_client == undefined) { T.logWarn("ROS not initialized!"); return; }
		let effective_timeout = (Number.isFinite(timeout_sec) && timeout_sec > 0)
			? timeout_sec : UI.Settings.getSynthesisTimeout();
		if (goal_msg != undefined && goal_msg.request != undefined) {
			goal_msg.request.synthesis_timeout_s = effective_timeout;
		}
		console.log("Synthesis.Client - request behavior synthesis ...");
		console.log(JSON.stringify(goal_msg));
		action_client.send_goal(goal_msg,
			function(result) { Synthesis.Result.handle(result, root, result_cb); },
			function(feedback) { feedbackCallback(feedback, feedback_cb); },
			effective_timeout * 1000,
			function() { timeoutCallback(timeout_cb); }
		);
	}

	this.cancelGoal = function() {
		if (action_client == undefined) { T.logWarn("ROS not initialized!"); return; }
		let topic = UI.Settings.getSynthesisTopic();
		API.postData('cancel_action_goal', {topic: topic}, function(result_data) {
			if (result_data.canceled) {
				console.log("Synthesis.Client: synthesis goal canceled.");
			} else {
				T.logWarn("Synthesis.Client: synthesis cancel - " + (result_data.reason || "no active goal"));
			}
		}, function(error) {
			T.logError("Synthesis.Client: failed to cancel synthesis goal - " + error);
		});
	}

	this.requestBehavior = function(root, system, goal, initial_condition, outcomes, result_cb, feedback_cb, timeout_cb) {
		let goals = Array.isArray(goal) ? goal : [goal];
		let initial_conditions = Array.isArray(initial_condition) ? initial_condition : [initial_condition];
		var goal_msg = {
			request: {
				name: root,
				spec_name: root,
				system: system,
				system_name: system,
				goal: goal,
				goals: goals,
				initial_condition: initial_condition,
				initial_conditions: initial_conditions,
				sm_outcomes: outcomes,
				specification_file_name: "",
				synthesis_timeout_s: UI.Settings.getSynthesisTimeout()
			},
			synthesis_options: ""
		};
		that.requestGoal(goal_msg, root, result_cb, feedback_cb, timeout_cb);
	}

	this.DEBUG_handleResult = function(result, root) {
		Synthesis.Result.handle(result, root);
	}

}) ();
