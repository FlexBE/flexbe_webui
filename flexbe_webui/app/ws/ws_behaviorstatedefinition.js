WS.BehaviorStateDefinition = function(manifest, outcomes, input_keys, output_keys, bsm_loaded_callback) {
	var that = this;

	var autonomy = [];
	for (var i = 0; i < outcomes.length; ++i) {
		autonomy.push(-1);
	};
	var path = manifest.rosnode_name + "." + manifest.codefile_name.replace(".py", "");
	var behavior_name = manifest.name;
	var behavior_manifest = manifest;
	var behavior_tag_list = manifest.tags.replace(/[,;]/g, " ").replace(/\s+/g, " ").split(" ");
	var bsm_parsing_result = undefined;
	var bsm_loading = false;
	var bsm_waiting_callbacks = [];

	var flushBSMCallbacks = function(success) {
		bsm_loading = false;
		var callbacks = bsm_waiting_callbacks;
		bsm_waiting_callbacks = [];
		callbacks.forEach(function(cb) {
			if (cb != undefined) {
				cb(success);
			}
		});
	}

	var parseBSMManifest = function(target_manifest, callback) {
		bsm_loading = true;
		IO.BehaviorLoader.parseBehaviorSM(target_manifest, function(parsing_result) {
			bsm_parsing_result = parsing_result;
			var success = parsing_result != undefined;
			if (!success) {
				console.warn(`Failed to parse behavior state machine for '${behavior_name}'`);
			}
			if (callback != undefined) {
				callback(success);
			}
			flushBSMCallbacks(success);
		});
	}

	// Parse SM immediately if content is already available; otherwise defer to ensureBSMReady().
	if (behavior_manifest.codefile_content) {
		parseBSMManifest(behavior_manifest, bsm_loaded_callback);
	}

	var documentation = new WS.Documentation(manifest.description);
	var parameters = [];
	var parameterDefaults = [];
	manifest.params.forEach(param => {
		parameters.push(param.name);
		var defaultValue = (param.type == "text" || param.type == "enum")? '"' + param.default + '"' : param.default;
		parameterDefaults.push(defaultValue); 
		var desc = "<div style='margin-bottom: 0.5em;'>Default: <i>" + defaultValue + "</i></div>" + param.label + ": " + param.hint;
		var info = "";
		if (param.type == "numeric") {
			info = "Value range: " + param.additional.min + " - " + param.additional.max;
		} else if (param.type == "enum") {
			info = "Possible values:";
			param.additional.forEach(opt => {
				info += "<br />&nbsp;&nbsp;&nbsp;&nbsp;- " + opt;
			});
		}
		if (info != "") {
			desc += "<div style='margin-top: 0.5em;'>" + info + "</div>";
		}
		documentation.addDescription('--', param.name, param.type, desc);
	});
	
	this.__proto__ = new WS.StateDefinition(manifest.class_name, documentation,
		path, parameters, outcomes, input_keys, output_keys, parameterDefaults, autonomy, []);

	this.getBehaviorName = function() { return behavior_name; }
	this.getBehaviorManifest = function() { return behavior_manifest; }
	this.getBehaviorDesc = function() { return behavior_manifest.description; }
	this.getBehaviorTagList = function() { return behavior_tag_list; }
	this.hasBSMResult = function() { return bsm_parsing_result != undefined; }
	this.getDefaultUserdata = function() {
		return bsm_parsing_result ? bsm_parsing_result.default_userdata : [];
	}
	this.cloneBehaviorStatemachine = function() {
		if (bsm_parsing_result == undefined) {
			console.warn(`cloneBehaviorStatemachine called on '${behavior_name}' before ensureBSMReady — returning empty SM`);
			return IO.ModelGenerator.buildStateMachine("", behavior_name, [], []);
		}
		return IO.ModelGenerator.buildStateMachine(bsm_parsing_result.container_name, bsm_parsing_result.container_sm_var_name,
													bsm_parsing_result.sm_defs, bsm_parsing_result.sm_states, true);
	}
	// Ensures full code is fetched and SM is parsed.  Safe to call multiple times.
	this.ensureBSMReady = function(callback) {
		if (bsm_parsing_result != undefined) {
			if (callback != undefined) {
				callback(true);
			}
			return;
		}
		if (callback != undefined) {
			bsm_waiting_callbacks.push(callback);
		}
		if (bsm_loading) {
			return;
		}
		IO.BehaviorLoader.ensureFullContent(behavior_manifest, function(full_manifest) {
			if (full_manifest == undefined) {
				console.warn(`ensureBSMReady: failed to fetch content for '${behavior_name}'`);
				flushBSMCallbacks(false);
				return;
			}
			parseBSMManifest(full_manifest);
		});
	}
};
