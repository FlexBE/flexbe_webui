WS.BehaviorStateDefinition = function(manifest, outcomes, input_keys, output_keys, bsm_loaded_callback) {
	var that = this;

	var getBehaviorModulePath = function(target_manifest) {
		var module_path = target_manifest.codefile_relpath || target_manifest.codefile_name || "";
		module_path = module_path.replace(/\.py$/i, "").replace(/[\\/]+/g, ".");
		if (module_path == "") {
			return target_manifest.rosnode_name;
		}
		if (module_path.indexOf(target_manifest.rosnode_name + ".") == 0) {
			return module_path;
		}
		return target_manifest.rosnode_name + "." + module_path;
	}

	var autonomy = [];
	for (var i = 0; i < outcomes.length; ++i) {
		autonomy.push(-1);
	};
	var path = getBehaviorModulePath(manifest);
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
	var validateParameterMetadata = function(param) {
		if (param.type == "numeric") {
			if (param.additional == undefined || param.additional == null
			 || param.additional.min == undefined || param.additional.max == undefined) {
				throw new Error("Invalid behavior manifest '" + behavior_name
					+ "': numeric parameter '" + param.name
					+ "' is missing required min/max metadata.");
			}
		}
	};
	var buildParameterDescription = function(param, defaultValue) {
		var descriptionLines = [
			"Default: " + defaultValue,
			param.label + ": " + param.hint
		];
		if (param.type == "numeric") {
			descriptionLines.push("");
			descriptionLines.push("Value range: " + param.additional.min + " - " + param.additional.max);
		} else if (param.type == "enum") {
			descriptionLines.push("");
			descriptionLines.push("Possible values:");
			(param.additional || []).forEach(opt => {
				descriptionLines.push("    - " + opt);
			});
		}
		return descriptionLines.join("\n");
	};
	manifest.params.forEach(param => {
		validateParameterMetadata(param);
		parameters.push(param.name);
		var defaultValue = (param.type == "text" || param.type == "enum")? '"' + param.default + '"' : param.default;
		parameterDefaults.push(defaultValue);
		var desc = buildParameterDescription(param, defaultValue);
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
