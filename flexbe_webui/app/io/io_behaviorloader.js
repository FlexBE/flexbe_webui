IO.BehaviorLoader = new (function() {
	var that = this;

	var parseCode = function(file_content, manifest_data, callback) {
		callback = callback || console.error;
		var parsingResult;
		try {
			parsingResult = IO.CodeParser.parseCode(file_content);
			T.logInfo("Code parsing completed.");
		} catch (err) {
			var error_string = "Code parsing failed: " + err;
			T.logError(error_string);
			console.log(`\x1b[91m${err.stack}\x1b[0m`);
			callback(error_string);
			return;
		}
		try {
			applyParsingResult(parsingResult, manifest_data);
			T.logInfo("Behavior " + parsingResult.behavior_name + " loaded.");
		} catch (err) {
			var error_string = "Failed to apply parsing result: " + err;
			T.logError(error_string);
			console.log(`\x1b[91m${err.stack}\x1b[0m`);
			callback(error_string);
			return;
		}

		var error_string = Checking.checkBehavior();
		if (error_string != undefined) {
			T.logError("The loaded behavior contains errors! Please fix and save:");
			T.logError(error_string);
			RC.Controller.signalChanged();
		}
		callback(error_string);
	}

	var applyParsingResult = function(result, manifest) {
		IO.ModelGenerator.generateBehaviorAttributes(result, manifest);

		T.logInfo("Building behavior state machine...");
		var sm = IO.ModelGenerator.buildStateMachine("", result.root_sm_name, result.sm_defs, result.sm_states);
		Behavior.setStatemachine(sm);
		UI.Statemachine.resetStatemachine();
		T.logInfo("Behavior state machine built.");

		ActivityTracer.resetActivities();

		if (!manifest.editable) {
			Behavior.setReadonly(true);
		}
		UI.Statemachine.refreshView();
	}

	var resetEditor = function() {
		Behavior.resetBehavior();
		UI.Dashboard.resetAllFields();
		UI.Statemachine.resetStatemachine();

		// make sure a new behavior always starts at the dashboard
		UI.Menu.toDashboardClicked();
		UI.Panels.setActivePanel(UI.Panels.NO_PANEL);
	}

	this.loadBehavior = function(manifest, callback) {
		T.clearLog();
		UI.Panels.Terminal.show();

		resetEditor();

		T.logInfo("Loading behavior ...");
		T.logInfo("Manifest path: " + manifest.manifest_path);
		T.logInfo("Behavior path: " + manifest.codefile_path);
		T.logInfo("Behavior name: " + manifest.codefile_name);
		T.logInfo("Parsing sourcecode...");
		parseCode(manifest.codefile_content, manifest, callback);
	}

	this.loadBehaviorInterface = function(behavior_data, callback) {
		try {
			var parsingResult = IO.CodeParser.parseSMInterface(behavior_data.codefile_content);
			callback(parsingResult);
		} catch (err) {
			T.logError("Failed to parse behavior interface of " + behavior_data.name + ": " + err);
			return;
		}
	}

	this.updateManualSections = function(callback) {
		var names = Behavior.createNames();
		var package_name = names.rosnode_name;
		ROS.getPackagePythonPath(package_name, (folder_path) => {
			if (folder_path == undefined) {
				return;
			}
			var file_path = `${folder_path}/${names.file_name}`;
			IO.Filesystem.checkFileExists(folder_path, names.file_name, (exists) => {
				if (exists) {
					IO.Filesystem.readFile(file_path, (content) => {
						var extract_result = IO.CodeParser.extractManual(content);
						let manual_code_import = [];
						if (extract_result.manual_import.trim() !== '') {
							manual_code_import = extract_result.manual_import.trim().split('\n').filter(line => line.trim() !== '');
						}
						console.log(`\x1b[93m Behavior loader manual import ${JSON.stringify(manual_code_import)}\n'${extract_result.manual_import}'\x1b[0m`);
						Behavior.setManualCodeImport(manual_code_import);
						Behavior.setManualCodeInit(extract_result.manual_init);
						Behavior.setManualCodeCreate(extract_result.manual_create);
						Behavior.setManualCodeFunc(extract_result.manual_func);
						callback();
					});
				} else {
					process.nextTick(() => {
						callback();
					});
				}
			});
		});
	}

	this.parseBehaviorSM = function(manifest, callback) {
		console.log(`\x1b[92mPreparing sourcecode of behavior '${manifest.name}'\x1b[0m`);
		try {
			parsingResult = IO.CodeParser.parseCode(manifest.codefile_content);
		} catch (err) {
			console.log(`\x1b[91mCode parsing failed: ${err}\x1b[0m`);
			return;
		}
		callback({
			container_name: "",
			container_sm_var_name: parsingResult.root_sm_name,
			sm_defs: parsingResult.sm_defs,
			sm_states: parsingResult.sm_states,
			default_userdata: parsingResult.default_userdata
		});
	}

	this.loadBehaviorDependencies = function(manifest, ignore_list) {
		manifest.contains.forEach(function(be_name) {
			if (!ignore_list.contains(be_name)) {
				var lib_entry = WS.Behaviorlib.getByName(be_name);
				WS.Behaviorlib.updateEntry(lib_entry);
				ignore_list.push(be_name);
				ignore_list = that.loadBehaviorDependencies(lib_entry.getBehaviorManifest(), ignore_list);
			}
		});
		return ignore_list;
	}

}) ();
