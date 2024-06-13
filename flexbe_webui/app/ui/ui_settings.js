UI.Settings = new (function() {
	var that = this;

	// external configuration settings
	var code_indentation;
	var collapse_info;
	var collapse_warn;
	var collapse_error;
	var collapse_hint;
	var commands_enabled;
	var commands_key;

	var default_package;
	var editor_command;
	var explicit_states;
	var gridsize;

	var pkg_cache_enabled;

	var runtime_timeout;
	var stop_behaviors;

	var save_in_source;
	var source_code_root;

	var synthesis_enabled;
	var synthesis_topic;
	var synthesis_type;
	var synthesis_system;

	var text_encoding;
	var transition_mode;

	// --------- Internal selection
	var state_pkg_cache;
	var behavior_pkg_cache;

	var getConfiguration = function() {
		return {
			'code_indentation': code_indentation,
			'collapse_info': collapse_info,
			'collapse_warn': collapse_warn,
			'collapse_error': collapse_error,
			'collapse_hint': collapse_hint,
			'commands_enabled': commands_enabled,
			'commands_key': commands_key,
			'default_package': default_package,
			'editor_command': editor_command,
			'explicit_states': explicit_states,
			'gridsize': gridsize,
			'pkg_cache_enabled': pkg_cache_enabled,
			'runtime_timeout': runtime_timeout,
			'save_in_source': save_in_source,
			'source_code_root': source_code_root,
			//'start_parser': state_parser,
			'stop_behaviors': stop_behaviors,
			'synthesis_enabled': synthesis_enabled,
			'synthesis_topic': synthesis_topic,
			'synthesis_type': synthesis_type,
			'synthesis_system': synthesis_system,
			'text_encoding': text_encoding,
			'transition_mode': transition_mode,
		};
	}

	var storeSettings = function() {
		var config = JSON.stringify({
			'code_indentation': code_indentation,
			'collapse_info': collapse_info,
			'collapse_warn': collapse_warn,
			'collapse_error': collapse_error,
			'collapse_hint': collapse_hint,
			'commands_enabled': commands_enabled,
			'commands_key': commands_key,
			'default_package': default_package,
			'editor_command': editor_command,
			'explicit_states': explicit_states,
			'gridsize': gridsize,
			'pkg_cache_enabled': pkg_cache_enabled,
			'runtime_timeout': runtime_timeout,
			'save_in_source': save_in_source,
			'source_code_root': source_code_root,
			//'state_parser': state_parser,
			'stop_behaviors': stop_behaviors,
			'synthesis_enabled': synthesis_enabled,
			'synthesis_topic': synthesis_topic,
			'synthesis_type': synthesis_type,
			'synthesis_system': synthesis_system,
			'text_encoding': text_encoding,
			'transition_mode': transition_mode,
			// ------------------------------
			'state_pkg_cache': state_pkg_cache,
			'behavior_pkg_cache': behavior_pkg_cache,
		});
		localStorage.setItem('config', config);
		displaySettingsHints();

		console.log(`Configuration changed.`);
		try {
			json_dict = {};
			json_dict['configuration'] = getConfiguration();

			API.post('save_config_settings', json_dict, (result) => {
				console.log(`save_config_settings: ${JSON.stringify(result)}`);
				if (result.success) {
					console.log('Updated the configuration settings on server!');
				} else {
					T.logError('Failed to update configuration settings on the server: \n' + result.text);
				}
			});
		} catch (err) {
			T.logError('Failed to export configuration: ' + err);
		}

	}


	this.retrieveConfigurationSettings = async function(json_dict={}) {
		console.log(`Attempting to retrieve configuration settings '${JSON.stringify(json_dict)}' ...`);
		API.post('get_config_settings', json_dict, (result) => {
			if (result.success) {
				T.logInfo('Retrieved configuration settings');
				items = result.configuration
				code_indentation = items.code_indentation;
				document.getElementById("select_code_indentation").selectedIndex = items.code_indentation;

				collapse_info = items.collapse_info;
				document.getElementById("cb_collapse_info").checked = items.collapse_info;
				collapse_warn = items.collapse_warn;
				document.getElementById("cb_collapse_warn").checked = items.collapse_warn;
				collapse_error = items.collapse_error;
				document.getElementById("cb_collapse_error").checked = items.collapse_error;
				collapse_hint = items.collapse_hint;
				document.getElementById("cb_collapse_hint").checked = items.collapse_hint;

				commands_enabled = items.commands_enabled;
				document.getElementById("cb_commands_enabled").checked = items.commands_enabled;
				commands_key = items.commands_key;
				document.getElementById("input_commands_key").value = items.commands_key;

				default_package = items.default_package;
				that.createBehaviorPackageSelect(document.getElementById("select_default_package"));

				editor_command = items.editor_command;
				document.getElementById("input_editor_command").value = items.editor_command;

				explicit_states = items.explicit_states;
				document.getElementById("cb_explicit_states").checked = items.explicit_states;

				gridsize = items.gridsize;
				document.getElementById("input_gridsize").value = items.gridsize;

				pkg_cache_enabled = items.pkg_cache_enabled;
				document.getElementById("cb_pkg_cache_enabled").checked = items.pkg_cache_enabled;

				runtime_timeout = items.runtime_timeout;
				document.getElementById("input_runtime_timeout").value = items.runtime_timeout;

				save_in_source = items.save_in_source;
				document.getElementById("cb_save_in_source").checked = items.save_in_source;
				source_code_root = items.source_code_root;
				document.getElementById("input_source_code_root").value = items.source_code_root;

				// state_parser = items.state_parser.toLowerCase();
				// document.getElementById("select_state_parser").value = state_parser;

				stop_behaviors = items.stop_behaviors;
				document.getElementById("cb_stop_behaviors").checked = items.stop_behaviors;

				synthesis_enabled = items.synthesis_enabled;
				document.getElementById("cb_synthesis_enabled").checked = items.synthesis_enabled;
				synthesis_topic = items.synthesis_topic;
				document.getElementById("input_synthesis_topic").value = items.synthesis_topic;
				synthesis_type = items.synthesis_type;
				document.getElementById("input_synthesis_type").value = items.synthesis_type;
				synthesis_system = items.synthesis_system;
				document.getElementById("input_synthesis_system").value = items.synthesis_system;
				updateSynthesisInterface();

				text_encoding = items.text_encoding.toUpperCase();
				document.getElementById("select_encoding").value = text_encoding;

				transition_mode = items.transition_mode;
				document.getElementById("select_transition_mode").selectedIndex = items.transition_mode;
			} else {
				T.logError('Failed to load configuration: \n' + result.text);
			}
		});
	}

	this.retrievePackageData = async function() {
		API.get("packages/states", state_result => {
			state_pkg_cache = state_result;
			API.get("packages/behaviors", behavior_result => {
				behavior_pkg_cache = behavior_result;
				console.log(`update behavior package cache with ${behavior_pkg_cache.length} behaviors`);
				storeSettings(); // to update cache
				updateWorkspaceDisplay();

				that.createBehaviorPackageSelect(document.getElementById("select_default_package"));
				that.createBehaviorPackageSelect(document.getElementById("select_behavior_package"));
				Behavior.setBehaviorPackage(document.getElementById('select_behavior_package').value);

				// async
				that.updateStatelib();
				that.updateBehaviorlib();
			});
		});
	}

	this.updateStatelib = function() {
		// console.log("UI.Settings updateStateLib ...");
		WS.Statelib.resetLib();
		state_pkg_cache.forEach(state_pkg => {
			// console.log("    " + state_pkg.name + " ...");
			API.get(`io/states/${state_pkg.name}`, state_defs => {
				state_defs.forEach(state_data => {
					var state_def = IO.StateParser.parseState(state_data);
					WS.Statelib.addToLib(state_def);
				});
			});
		});
		// console.log("UI.Settings updateStateLib is done!");
		}

	this.updateBehaviorlib = function() {
		// console.log("UI.settings: updateBehaviorLib ...");
		WS.Behaviorlib.resetLib();
		behavior_pkg_cache.forEach(behavior_pkg => {
			// console.log("    '" + behavior_pkg.name + "' ...");
			API.get(`io/behaviors/${behavior_pkg.name}`, behavior_defs => {
				behavior_defs.forEach(behavior_data => {
					IO.BehaviorLoader.loadBehaviorInterface(behavior_data, function(ifc) {
						var behavior_def = new WS.BehaviorStateDefinition(behavior_data, ifc.smi_outcomes, ifc.smi_input, ifc.smi_output);
						WS.Behaviorlib.addToLib(behavior_def);
					});
				});
			});
		});
		// console.log("UI.settings: updateBehaviorLib is done!");
	}

	this.createBehaviorPackageSelect = function(select_el, add_all_option) {
		select_el.innerHTML = "";
		if (behavior_pkg_cache == undefined || behavior_pkg_cache.length == 0) {
			return;
		}
		if (add_all_option) {
			var option = document.createElement("option");
			option.setAttribute("value", "ALL");
			option.innerText = "ALL";
			select_el.appendChild(option);
		}
		for (var i=0; i<behavior_pkg_cache.length; i++) {
			var option = document.createElement("option");
			option.setAttribute("value", behavior_pkg_cache[i]["name"]);
			option.innerText = behavior_pkg_cache[i]["name"];
			select_el.appendChild(option);
		}
		if (!add_all_option) {
			var default_package_index = behavior_pkg_cache.map((pkg) => { return pkg['name']; }).indexOf(default_package);
			if (default_package_index < 0) {
				default_package_index = 0;
				default_package = behavior_pkg_cache[0]['name'];
			}
			select_el.selectedIndex = default_package_index;
		}
	}

	this.createStatePackageSelect = function(select_el, add_all_option) {
		select_el.innerHTML = "";
		if (state_pkg_cache == undefined || state_pkg_cache.length == 0) {
			return;
		}
		if (add_all_option) {
			var option = document.createElement("option");
			option.setAttribute("value", "ALL");
			option.innerText = "ALL";
			select_el.appendChild(option);
		}
		for (var i=0; i<state_pkg_cache.length; i++) {
			var option = document.createElement("option");
			option.setAttribute("value", state_pkg_cache[i]["name"]);
			option.innerText = state_pkg_cache[i]["name"];
			select_el.appendChild(option);
		}
	}

	var displaySettingsHints = function() {
		if (behavior_pkg_cache == undefined || behavior_pkg_cache.length == 0) {
			var action_div = document.createElement("div");

			var pkg_select = document.createElement("select");
			pkg_select.setAttribute("style", "width:100%; margin: 5px 0;");
			var pkg_select_update_title = function() {
				if (pkg_select.options.length > 0) {
					pkg_select.setAttribute("title", pkg_select.options[pkg_select.selectedIndex].getAttribute("title"));
				}
			};
			pkg_select.addEventListener('change', pkg_select_update_title);
			console.log(`\x1b[91m skipping ros_pkg_cache check and selection options\x1b[0m`);
			// var packages = ros_pkg_cache.filter((pkg) => { return !pkg['path'].startsWith("/opt/ros"); });
			// for (var i=0; i<packages.length; i++) {
			// 	var option = document.createElement("option");
			// 	option.setAttribute("value", packages[i]["name"]);
			// 	option.setAttribute("title", packages[i]["path"]);
			// 	option.innerText = packages[i]["name"];
			// 	pkg_select.appendChild(option);
			// }

			// var suggestion = packages.findElement((pkg) => { return pkg['name'] == "flexbe_behaviors"; });
			// suggestion = suggestion || packages.findElement((pkg) => { return pkg['name'].indexOf("flexbe_behaviors") != -1; });
			// if (suggestion != undefined) {
			// 	pkg_select.selectedIndex = packages.indexOf(suggestion);
			// }
			pkg_select_update_title();

			var pkg_convert_cb = document.createElement("input");
			pkg_convert_cb.setAttribute("id", "pkg_convert_cb");
			pkg_convert_cb.setAttribute("type", "checkbox");
			if (suggestion != undefined) pkg_convert_cb.setAttribute("checked", "checked");
			var pkg_convert_label = document.createElement("label");
			pkg_convert_label.setAttribute("for", "pkg_convert_cb");
			pkg_convert_label.innerText = "Convert existing behaviors";
			var pkg_convert_group = document.createElement("div");
			pkg_convert_group.setAttribute("title", "If this package already contains behaviors in the old format, import them into this package. You can remove the old behavior packages afterwards.");
			pkg_convert_group.setAttribute("style", "vertical-align:middle; margin: 0 0 5px 0;");
			pkg_convert_group.appendChild(pkg_convert_cb);
			pkg_convert_group.appendChild(pkg_convert_label);

			var pkg_init_button = document.createElement("input");
			pkg_init_button.setAttribute("value", "Initialize");
			pkg_init_button.setAttribute("type", "button");
			pkg_init_button.addEventListener("click", function() {
				T.clearLog();
				T.logInfo("DEPRECATED: Initializing package " + pkg_select.value + "...");
				T.show();
				var pkg_name = pkg_select.value;
				var convert = pkg_convert_cb.checked;
				console.log(`   skipping initializeBehavior '${pkg_name}'  (${convert})`);
				// IO.PackageGenerator.initializeBehaviorPackage(pkg_name, convert, () => {
				// 	that.retrieveConfigurationSettings(); // load configuration parameters from server
				// 	T.logInfo("Initialization done!");
				// 	if (convert) {
				// 		T.logInfo("You can now remove the old behavior packages and the /behaviors folder in "+pkg_name+".");
				// 	}
				// });
			});

			action_div.appendChild(pkg_select);
			action_div.appendChild(pkg_convert_group);
			action_div.appendChild(pkg_init_button);
			UI.Feed.displayCustomMessage('msg_no_behavior_packages', 1, 'No Behavior Packages',
				'There are no behavior packages available. Please initialize a ROS package for this purpose or prepare one manually.',
				action_div
			);
		} else {
			var msg = document.getElementById('msg_no_behavior_packages');
			if (msg != undefined) msg.parentNode.removeChild(msg);
		}

		if (state_pkg_cache == undefined || state_pkg_cache.length == 0) {
			UI.Feed.displayCustomMessage('msg_no_state_packages', 1, 'No State Packages',
				'The list of available states is empty. You can find available states <a href="https://github.com/FlexBE" target="_blank">on Github</a>.'
			);
		} else {
			var msg = document.getElementById('msg_no_state_packages');
			if (msg != undefined) msg.parentNode.removeChild(msg);
		}
	}

	var updateWorkspaceDisplay = function() {
		var createEntry = function(pkg) {
			var entry = document.createElement("div");
			entry.setAttribute("class", "tag");
			entry.setAttribute("title", pkg['path']);
			entry.innerText = pkg['name'];
			pkg['display'] = entry;
			return entry;
		}
		var behavior_el = document.getElementById("workspace_behavior_packages");
		behavior_el.innerHTML = "";
		behavior_pkg_cache.forEach((behavior_pkg) => {
			var entry = createEntry(behavior_pkg);
			behavior_el.appendChild(entry);
		});
		var state_el = document.getElementById("workspace_state_packages");
		state_el.innerHTML = "";
		state_pkg_cache.forEach((state_pkg) => {
			var entry = createEntry(state_pkg);
			state_el.appendChild(entry);
		});
	}

	this.importConfiguration = async function() {
		console.log('Importing configuration files ...');
		const files_result = await API.get_async('get_config_files');
		if (files_result.success){
			console.log(` available configuration files: ${JSON.stringify(files_result.config_files)}`);
			try {
				const chosen_file = await chooseFile(files_result.folder_path, files_result.config_files);
				if (chosen_file) {
					console.log(`Attempting to load configuration from '${chosen_file}' ...`);
					var json_dict = {};
					json_dict['folder_path'] = files_result.folder_path;
					json_dict['file_name'] = chosen_file;
					that.retrieveConfigurationSettings(json_dict);
					console.log('Done importing configuration files');
				} else {
					T.logInfo(`Canceled configuration file import.`);
				}
			} catch (err) {
				T.logError(`Failed to import configuration file!`);
				console.log(`   ${err}`);
			}
		} else {
			T.logError(`Cannot retrieve available configuration files!`);
			console.log(`${files_result.text}`);
		}
	}

	this.exportConfiguration = async function() {
		const files_result = await API.get_async('get_config_files');
		if (files_result.success){
			console.log(` available configuration files: ${JSON.stringify(files_result.config_files)}`);
			try {
				const chosen_file = await chooseFile(files_result.folder_path, files_result.config_files);
				if (chosen_file) {
					console.log(`Attempting to save configuration to '${chosen_file}' ...`);
					var json_dict = {};
					json_dict['folder_path'] = files_result.folder_path;
					json_dict['file_name'] = chosen_file;
					json_dict['configuration'] = getConfiguration();

					console.log(`Attempting to save configuration '${JSON.stringify(json_dict)}' ...`);
					API.post('save_config_settings', json_dict, (result) => {
						if (result.success) {
							T.logInfo('Exported configuration file successfully!');
						} else {
							T.logError('Failed to export configuration: \n' + result.text);
						}
					});
				} else {
					T.logInfo(`Canceled configuration file export.`);
				}
			} catch (err) {
				T.logError(`Failed to export configuration file!`);
				console.log(`   ${err}`);
			}

		} else {
			T.logError(`Cannot retrieve available configuration files!`);
			console.log(`${files_result.text}`);
		}

	}


	this.getVersion = function() {
		// FlexBE Behavior Engine API version
		return "4.0.0";
	}


	// Runtime
	//=========

	this.collapseInfoClicked = function(evt) {
		collapse_info = evt.target.checked;
		storeSettings();
	}

	this.collapseWarnClicked = function(evt) {
		collapse_warn = evt.target.checked;
		storeSettings();
	}

	this.collapseErrorClicked = function(evt) {
		collapse_error = evt.target.checked;
		storeSettings();
	}

	this.collapseHintClicked = function(evt) {
		collapse_hint = evt.target.checked;
		storeSettings();
	}

	this.runtimeTimeoutChanged = function() {
		runtime_timeout = document.getElementById("input_runtime_timeout").value;
		RC.Controller.onboardTimeout = runtime_timeout;
		storeSettings();
	}

	this.saveInSourceClicked = function(evt) {
		save_in_source = evt.target.checked;
		console.log(`Save in source checkbox changed ${save_in_source}`);
		storeSettings();
	}

	this.sourceCodeRootChanged = function() {
		source_code_root = document.getElementById("input_source_code_root").value;
		console.log(`Source code root changed ${source_code_root}`);
		storeSettings();
	}

	this.stopBehaviorsClicked = function(evt) {
		stop_behaviors = evt.target.checked;
		storeSettings();
	}

	this.isStopBehaviors = function() {
		return stop_behaviors;
	}

	this.isCollapseInfo = function() { return collapse_info; }
	this.isCollapseWarn = function() { return collapse_warn; }
	this.isCollapseError = function() { return collapse_error; }
	this.isCollapseHint = function() { return collapse_hint; }


	// Code
	//======

	this.defaultPackageChanged = function() {
		var el = document.getElementById('select_default_package');
		default_package = el.value;
		el.blur(); // lose focus on widget
		storeSettings();
	}

	this.codeIndentationChanged = function() {
		var el = document.getElementById('select_code_indentation');
		code_indentation = el.selectedIndex;
		storeSettings();
	}

	this.encodingChanged = function() {
		var el = document.getElementById('select_encoding');
		text_encoding = el.value;
		storeSettings();
	}

	this.explicitStatesClicked = function(evt) {
		explicit_states = evt.target.checked;
		storeSettings();
	}

	this.editorCommandChanged = function() {
		var el = document.getElementById('input_editor_command');
		editor_command = el.value;
		storeSettings();
	}

	this.getDefaultPackage = function() {
		return default_package;
	}

	this.getCodeIndentation = function() {
		var chars = ['\t', '  ', '    ', '        '];
		return chars[code_indentation];
	}

	this.isExplicitStates = function() {
		return explicit_states;
	}

	this.getEditorCommand = function(file_path, line_number) {
		if (line_number == undefined) line_number = 0;
		return editor_command; // process file name and line on the server side
	}


	// Editor
	//========

	this.transitionEndpointsChanged = function() {
		var el = document.getElementById('select_transition_mode');
		transition_mode = el.selectedIndex;
		storeSettings();
	}

	this.gridsizeChanged = function() {
		var el = document.getElementById('input_gridsize');
		gridsize = parseInt(el.value);
		storeSettings();
	}

	this.commandsEnabledClicked = function(evt) {
		commands_enabled = evt.target.checked;
		storeSettings();
	}

	this.commandsKeyChanged = function() {
		var el = document.getElementById('input_commands_key');
		commands_key = el.value;
		storeSettings();
	}

	this.isTransitionModeCentered = function() {
		return transition_mode == 0;
	}

	this.isTransitionModeCombined = function() {
		return transition_mode == 2;
	}

	this.getGridsize = function() {
		return gridsize;
	}

	this.isCommandsEnabled = function() {
		return commands_enabled;
	}

	this.getCommandsKey = function() {
		return commands_key;
	}


	// ROS Properties
	//================

	this.setRosProperties = function(ns) {
		console.log(`setRosProperties ns='${ns}' `);
		if (ns == '')  ns = '/';
		if (ns != '/') {
			document.getElementById('label_editor_title').innerHTML = ns.slice(1,-1);
		}
		document.getElementById('ros_prop_namespace').value = ns;
		var status_disp = document.getElementById('ros_prop_status');
		var connect_button = document.getElementById('button_ros_connect');
		if (RC.ROS.isOfflineMode()) {
			status_disp.value = "Offline mode - no ROS connection.";
			status_disp.style.color = "#900";
			connect_button.value = "Offline";
			connect_button.disabled = true;
		} else if (RC.ROS.isStopping()) {
			status_disp.value = "Stopping connection.";
			status_disp.style.color = "#900";
			connect_button.value = "---";
		} else if (RC.ROS.isConnected()) {
			status_disp.value = "Connected to ROS!";
			status_disp.style.color = "#090";
			connect_button.value = "Disconnect";
		} else if (RC.ROS.isTrying()) {
			console.log("Waiting for ROS connection ...");
			status_disp.value = "Waiting for ROS connection ...";
			status_disp.style.color = "#009";
			connect_button.value = "Disconnect";
		} else {
			console.log(`Not connected : connected=${RC.ROS.isConnected()}, trying=${RC.ROS.isTrying()}, stopping=${RC.ROS.isStopping()}\x1b[0m`);
			status_disp.value = "Not connected.";
			status_disp.style.color = "#999";
			connect_button.value = "Connect";
		}
	}

	this.rosConnectClicked = function() {
		try {
			if (RC.ROS.isOfflineMode()) {
				console.log(`\x1b[93m Invalid button press while offline`);
				T.logWarn(`ROS Connect: Cannot establish ROS connection in offline mode!`);
			} else if (RC.ROS.isStopping()){
				console.log(`\x1b[93m Invalid button press while`);
				console.log(`    connected=${RC.ROS.isConnected()}, trying=${RC.ROS.isTrying()}, stopping=${RC.ROS.isStopping()}\x1b[0m`);
				T.logWarn(`ROS Connect: Patience while prior command completes!`);
			} else {
				if (RC.ROS.isConnected() || RC.ROS.isTrying()) {
					console.log(`\x1b[91mRequesting to close ROS connections\x1b[0m`)
					RC.ROS.closeConnection();
				} else {
					console.log(`\x1b[96mRequesting to open ROS connections\x1b[0m`)
					RC.ROS.trySetupConnection();
				}
			}
		} catch(err) {
			T.logError('Connection error');
			console.log(`\x1b[91mConnection error: ${err}\x1b[0m`);
			console.log(e.stack);
		}
	}


	// Workspace
	//===========

	// this.stateParserChanged = function() {
	// 	var el = document.getElementById('select_state_parser');
	// 	state_parser = el.value;
	// 	storeSettings();
	// }

	this.pkgCacheEnabledClicked = function(evt) {
		pkg_cache_enabled = evt.target.checked;
		storeSettings();
	}

	this.forceDiscoverClicked = function() {
		state_pkg_cache = [];
		behavior_pkg_cache = [];
		console.log(`\x1b[93mForce discover of behaviors and states ...\x1b[0m`);

		that.retrievePackageData();
	}

	// this.getStateParser = function() {
	// 	return state_parser;
	// }


	// Synthesis
	//===========

	this.synthesisEnabledClicked = function(evt) {
		synthesis_enabled = evt.target.checked;
		storeSettings();
		updateSynthesisInterface();
	}

	this.synthesisTopicChanged = function() {
		var el = document.getElementById('input_synthesis_topic');
		synthesis_topic = el.value;
		storeSettings();
	}

	this.synthesisTypeChanged = function() {
		var el = document.getElementById('input_synthesis_type');
		synthesis_type = el.value;
		storeSettings();
	}

	this.synthesisSystemChanged = function() {
		var el = document.getElementById('input_synthesis_system');
		synthesis_system = el.value;
		storeSettings();
	}

	this.isSynthesisEnabled = function() {
		return synthesis_enabled;
	}

	this.getSynthesisTopic = function() {
		return synthesis_topic;
	}

	this.getSynthesisType = function() {
		return synthesis_type;
	}

	this.getSynthesisSystem = function() {
		return synthesis_system;
	}

	var updateSynthesisInterface = function() {
		console.log("UI.Settings - updateSynthesisInterface " + synthesis_enabled);
		if (synthesis_enabled) {
			document.getElementById('synthesis_display_option').style.display = "inline";
			if (RC.ROS.isConnected()) {
				RC.PubSub.initializeSynthesisAction();
			} else {
				T.logError("ROS is not connected - cannot activate synthesis interface!")
			}
		} else {
			document.getElementById('synthesis_display_option').style.display = "none";
		}
	}

	var chooseFile = async function(folder_path, list_of_files) {
		return new Promise((resolve) => {
			// Create modal elements
			const modal = document.createElement('div');
			modal.id = 'file-modal';
			modal.className = 'modal';
			document.body.appendChild(modal);

			const modalContent = document.createElement('div');
			modalContent.className = 'modal-content';
			modal.appendChild(modalContent);

			const closeSpan = document.createElement('span');
			closeSpan.className = 'close';
			closeSpan.innerHTML = '&times;';
			modalContent.appendChild(closeSpan);

			const modalTitle = document.createElement('h2');
			modalTitle.textContent = 'Select a File';
			modalContent.appendChild(modalTitle);

			// Folder label and input
			const folderLabel = document.createElement('label');
			folderLabel.textContent = 'Folder:';
			modalContent.appendChild(folderLabel);

			const folderPathInput = document.createElement('input');
			folderPathInput.type = 'text';
			folderPathInput.id = 'folder-path-input';
			folderPathInput.value = folder_path;
			folderPathInput.readOnly = true;
			folderPathInput.style.userSelect = 'none'; // Prevent text selection
			modalContent.appendChild(folderPathInput);

			// File name label and input
			const fileLabel = document.createElement('label');
			fileLabel.textContent = 'File Name:';
			modalContent.appendChild(fileLabel);

			const fileInput = document.createElement('input');
			fileInput.type = 'text';
			fileInput.id = 'file-input';
			fileInput.placeholder = 'Enter file name';
			modalContent.appendChild(fileInput);

			const availableLabel = document.createElement('label');
			availableLabel.textContent = 'Available Files:';
			modalContent.appendChild(availableLabel);

			// File list div
			const fileListDiv = document.createElement('div');
			fileListDiv.id = 'file-list';
			modalContent.appendChild(fileListDiv);

			const selectFileButton = document.createElement('button');
			selectFileButton.id = 'select-file-button';
			selectFileButton.textContent = 'Select File';
			modalContent.appendChild(selectFileButton);

			const cancelButton = document.createElement('button');
			cancelButton.id = 'cancel-button';
			cancelButton.textContent = 'Cancel';
			modalContent.appendChild(cancelButton);

			// Style for the modal (can be moved to a CSS file)
			const style = document.createElement('style');
			style.textContent = `
				.modal {
					display: block;
					position: fixed;
					z-index: 1;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					overflow: auto;
					background-color: rgb(0,0,0);
					background-color: rgba(0,0,0,0.4);
					padding-top: 60px;
				}
				.modal-content {
					background-color: #fefefe;
					margin: 5% auto;
					padding: 20px;
					border: 1px solid #888;
					width: 80%;
					max-width: 500px;
				}
				.close {
					color: #aaa;
					float: right;
					font-size: 28px;
					font-weight: bold;
				}
				.close:hover,
				.close:focus {
					color: black;
					text-decoration: none;
					cursor: pointer;
				}
				label {
					display: block;
					margin-top: 10px;
					margin-bottom: 5px;
					font-weight: bold;
				}
				#folder-path-input,
				#file-input {
					width: 100%;
					padding: 10px;
					margin-bottom: 20px;
					border: 1px solid #ccc;
					box-sizing: border-box;
				}
				#folder-path-input {
					background-color: #f0f0f0;
					cursor: default;
				}
				#file-list {
					display: flex;
					flex-direction: column;
					gap: 10px;
					margin-bottom: 20px;
				}
				#file-list button {
					width: 100%;
					padding: 10px;
					text-align: left;
					border: 1px solid #ccc;
					background-color: #fff;
					cursor: pointer;
				}
				#file-list button:hover {
					background-color: #f0f0f0;
				}
				#select-file-button {
					width: 50%;
					padding: 10px;
					background-color: #007bff;
					color: #fff;
					border: none;
					cursor: pointer;
				}
				#select-file-button:hover {
					background-color: #0056b3;
				}
				#cancel-button {
					width: 50%;
					padding: 10px;
					background-color: #ff0000;
					color: #fff;
					border: none;
					cursor: pointer;
				}
				#cancel-button:hover {
					background-color: #0056b3;
				}
			`;
			document.head.appendChild(style);

			// Populate file list
			list_of_files.forEach(file => {
				const fileButton = document.createElement('button');
				fileButton.textContent = file;
				fileButton.addEventListener('click', () => {
					fileInput.value = file;
				});
				fileListDiv.appendChild(fileButton);
			});

			// Handle select button click
			selectFileButton.onclick = () => {
				const fileName = fileInput.value;
				if (fileName) {
					resolve(fileName);
					modal.remove();
				} else {
					alert('Please enter a file name or select one from the list.');
				}
			};

			cancelButton.onclick = () => {
				resolve(undefined);
				modal.remove();
			};

			// Handle modal close
			closeSpan.onclick = () => {
				resolve(undefined);
				modal.remove();
			};

			// Handle click outside of modal
			window.onclick = (event) => {
				if (event.target == modal) {
					resolve(undefined);
					modal.remove();
				}
			};
		});
	}

}) ();
