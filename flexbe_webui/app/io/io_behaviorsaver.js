IO.BehaviorSaver = new (function() {
	var that = this;

	var saveSuccessCallback = function() {
		T.logInfo("Save behavior was successful!");
		UI.Panels.Terminal.hide();
		UI.Settings.updateBehaviorlib();
		UI.Tools.notifyRosCommand('save');
	}


	this.saveStateMachine = function() {
		T.clearLog();
		UI.Panels.Terminal.show();

		T.logInfo("Generating code for '" + Behavior.getBehaviorName() + "' ...");
		// test conditions for generating code
		if (Behavior.getStatemachine().getStates().length == 0) throw "state machine contains no states";

		var names = Behavior.createNames();
		var json_code_dict = {};

		//info needed for code generation
		var ws = UI.Settings.getCodeIndentation();
		json_code_dict["ws"] = ws;

		var package_name = names.rosnode_name;
		json_code_dict["package_name"] = package_name;

		var file_name = names.file_name;
		json_code_dict["file_name"] = file_name;

		json_code_dict["explicit_package"]=UI.Settings.isExplicitStates();

		json_code_dict["behavior"] = Behavior;

		json_code_dict["behavior_names"] = helper_collectAllBehaviorNames(); // contained behaviors for manifest

		//code generator
		console.log("Post to behavior/code_generator ...");
		try{
			API.post(`behavior/code_generator`,
					 json_code_dict,
					 (result) => {
						if (result.install_success) {
							// Successfully saved code to the install folder
							T.logInfo("Code generation completed.");
							if (Behavior.file_name == undefined || Behavior.manifest_path == undefined) {
								console.log(`\x1b[92mSetting behavior file data ${JSON.stringify(result)}\x1b[0m`);
								Behavior.setFiles(result.python_file_name, result.manifest_file_path)
							}
							saveSuccessCallback();

							// Check attempt to save behavior to development source code folder
							if (result.src_save_src_success) {
								T.logInfo(`\x1b[92mSaved behavior code and manifest to source development folder.\x1b[0m`);
							} else {
								if (result.src_error_msg != ''){
									T.logError("Failed to save the behavior code to development folder");
									T.logInfo(result.src_error_msg);
								}
							}
						} else {
							// Failed to generate and save the behavior code
							T.logError("Failed to generate the behavior code!");
							T.logInfo(result.error_msg);
						}
					}
			);
			console.log(`\x1b[92mAfter post to behavior/code_generator ...\x1b[0m`);
		} catch (err) {
			T.logError("Code generation failed: "+ err);
			return;
		}
	}

	var helper_collectAllStates = function(sm) {
		var states = [];

		sm.getStates().forEach(function(element, i) {
			states.push(element);
			if (element instanceof Statemachine)
				helper_collectAllStates(element).forEach(function(state, j) {
					states.push(state);
				});
		});

		return states;
	}

	var helper_collectAllBehaviorNames = function() {
		var contained_behaviors = [];
		var states = helper_collectAllStates(Behavior.getStatemachine());
		for (var i = 0; i < states.length; i++) {
			if (!(states[i] instanceof BehaviorState)) continue;

			var contain_reference = contained_behaviors.findElement(function(element) {
				return element.getStateClass() == states[i].getStateClass();
			});
			if (contain_reference == undefined) {
				contained_behaviors.push(states[i]);
			}
		}
		var contained_behavior_names = []
		for (var i = 0; i < contained_behaviors.length; i++) {
			contained_behavior_names.push(contained_behaviors[i].getBehaviorName());
		}

		return contained_behavior_names;
	}

}) ();
