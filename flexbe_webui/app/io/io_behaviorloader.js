IO.BehaviorLoader = new (function() {
	var that = this;

	var findUniqueBehaviorByName = function(behavior_name) {
		var matches = WS.Behaviorlib.getBehaviorList().filter(function(element) {
			return element.getBehaviorName() == behavior_name;
		});
		if (matches.length == 1) {
			return matches[0];
		}
		return undefined;
	}

	var resolveBehaviorEntryByClassRef = function(class_ref, state_type_imports) {
		if (class_ref == undefined) {
			return undefined;
		}

		if (class_ref.includes("__")) {
			var split = class_ref.split("__");
			if (split.length == 2 && WS.Behaviorlib.getByClassAndPackage != undefined) {
				return WS.Behaviorlib.getByClassAndPackage(split[0], split[1]);
			}
		}

		if (state_type_imports != undefined && state_type_imports[class_ref] != undefined && WS.Behaviorlib.getByClassAndPackage != undefined) {
			var pkg = state_type_imports[class_ref];
			var by_pkg = WS.Behaviorlib.getByClassAndPackage(pkg, class_ref);
			if (by_pkg != undefined) {
				return by_pkg;
			}
		}

		return WS.Behaviorlib.getByClass != undefined ? WS.Behaviorlib.getByClass(class_ref) : undefined;
	}

	var buildLegacyContainsPackageHints = function(parsing_result) {
		var hints = {};
		if (parsing_result == undefined || parsing_result.sm_states == undefined) {
			return hints;
		}

		parsing_result.sm_states.forEach(function(sm_state_group) {
			sm_state_group.sm_states.forEach(function(state_def) {
				if (state_def.state_type != "behavior") return;
				var behavior_entry = resolveBehaviorEntryByClassRef(state_def.state_class, parsing_result.state_types || {});
				if (behavior_entry == undefined) return;
				var behavior_name = behavior_entry.getBehaviorName();
				var behavior_pkg = behavior_entry.getStatePackage();
				if (hints[behavior_name] == undefined) {
					hints[behavior_name] = behavior_pkg;
				} else if (hints[behavior_name] != behavior_pkg) {
					hints[behavior_name] = null;
				}
			});
		});
		return hints;
	}

	var resolveContainedBehaviorReference = function(container_manifest, entry, context_label, legacy_package_hints) {
		var be_name = (typeof entry === 'object') ? entry.name : entry;
		var be_pkg  = (typeof entry === 'object') ? (entry.package || null) : null;
		if (be_pkg) {
			return {
				be_name: be_name,
				be_key: be_pkg + '::' + be_name,
				lib_entry: WS.Behaviorlib.getByKey(be_pkg, be_name)
			};
		}

		var container_pkg = container_manifest ? container_manifest.rosnode_name : undefined;
		if (container_pkg != undefined) {
			T.logWarn(context_label + ": sub-behavior '" + be_name + "' has no package in manifest; "
				+ "defaulting lookup to same package '" + container_pkg + "'. Please resave to make this explicit.");
			var same_pkg_entry = WS.Behaviorlib.getByKey(container_pkg, be_name);
			if (same_pkg_entry != undefined) {
				return {
					be_name: be_name,
					be_key: container_pkg + '::' + be_name,
					lib_entry: same_pkg_entry
				};
			}
			T.logWarn(context_label + ": sub-behavior '" + be_name + "' was not found in same package '"
				+ container_pkg + "'; checking Python source hints and unique-name fallback.");
		}

		if (legacy_package_hints != undefined && legacy_package_hints[be_name] != undefined && legacy_package_hints[be_name] != null) {
			var hinted_pkg = legacy_package_hints[be_name];
			T.logWarn(context_label + ": resolved legacy sub-behavior '" + be_name + "' via Python source hint to package '"
				+ hinted_pkg + "'. Please resave to make this explicit.");
			var hinted_entry = WS.Behaviorlib.getByKey(hinted_pkg, be_name);
			if (hinted_entry != undefined) {
				return {
					be_name: be_name,
					be_key: hinted_pkg + '::' + be_name,
					lib_entry: hinted_entry
				};
			}
		}

		var lib_entry = findUniqueBehaviorByName(be_name);
		if (lib_entry == undefined) {
			T.logWarn(context_label + ": sub-behavior '" + be_name + "' is ambiguous without an explicit package.");
		}
		return {
			be_name: be_name,
			be_key: (lib_entry != undefined)
				? (lib_entry.getStatePackage() + '::' + lib_entry.getBehaviorName())
				: be_name,
			lib_entry: lib_entry
		};
	}

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

	// Fetches codefile_content for a manifest if not already loaded.
	// Calls callback(manifest) on success, callback(undefined) on failure.
	this.ensureFullContent = function(manifest, callback) {
		if (manifest.codefile_content) {
			callback(manifest);
			return;
		}
		var pkg = manifest.rosnode_name;
		var file = manifest.codefile_relpath || manifest.codefile_name;
		API.getData(`io/behavior/${pkg}/${file}`, function(full_data) {
			if (!full_data || !full_data.codefile_content) {
				T.logError("Received empty content for behavior '" + manifest.name + "'");
				callback(undefined);
				return;
			}
			manifest.codefile_content = full_data.codefile_content;
			callback(manifest);
		}, function(error) {
			T.logError("Failed to fetch full content for '" + manifest.name + "': " + error);
			callback(undefined);
		});
	}

	// Ensures all behaviors in manifest.contains (recursively) have their SM parsed.
	// Must be called before buildStateMachine to avoid empty sub-SMs.
	this.ensureSubbehaviorsReady = function(manifest, callback, legacy_package_hints) {
		var to_ready = [];
		var visited = new Set();
		var collect_failed_key = undefined;

		var collect = function(m) {
			if (!m.contains) return;
			m.contains.forEach(function(entry) {
				if (collect_failed_key != undefined) return;
				var resolved = resolveContainedBehaviorReference(m, entry, "ensureSubbehaviorsReady", legacy_package_hints);
				var be_key = resolved.be_key;
				if (!visited.has(be_key)) {
					visited.add(be_key);
					var lib_entry = resolved.lib_entry;
					if (lib_entry) {
						to_ready.push(lib_entry);
						collect(lib_entry.getBehaviorManifest());
					} else {
						T.logWarn("ensureSubbehaviorsReady: cannot find sub-behavior '" + be_key + "'");
						collect_failed_key = be_key;
					}
				}
			});
		};
		collect(manifest);

		if (collect_failed_key != undefined) {
			callback(false, collect_failed_key);
			return;
		}

		if (to_ready.length === 0) {
			callback(true);
			return;
		}
		var remaining = to_ready.length;
		var done = false;
		to_ready.forEach(function(lib_entry) {
			lib_entry.ensureBSMReady(function(success) {
				if (done) return;
				if (!success) {
					done = true;
					callback(false, lib_entry.getStatePackage() + "::" + lib_entry.getBehaviorName());
					return;
				}
				remaining--;
				if (remaining === 0) {
					done = true;
					callback(true);
				}
			});
		});
	}

	this.loadBehavior = function(manifest, callback) {
		T.clearLog();
		UI.Panels.Terminal.show();

		resetEditor();

		T.logInfo("Loading behavior...");
		T.logInfo("Manifest: " + manifest.manifest_path);
		T.logInfo("Code: " + manifest.codefile_path);
		T.logInfo("Behavior: " + manifest.codefile_name);
		T.logInfo("Fetching source code...");
		that.ensureFullContent(manifest, function(full_manifest) {
			if (full_manifest == undefined) {
				T.logError("Failed to load behavior source for '" + manifest.name + "'");
				callback("Failed to load behavior source");
				return;
			}
			T.logInfo("Parsing source code...");
			var parsingResult;
			try {
				parsingResult = IO.CodeParser.parseCode(full_manifest.codefile_content);
				T.logInfo("Code parsing completed.");
			} catch (err) {
				var parse_error_string = "Code parsing failed: " + err;
				T.logError(parse_error_string);
				console.log(`\x1b[91m${err.stack}\x1b[0m`);
				callback(parse_error_string);
				return;
			}
			var legacy_package_hints = buildLegacyContainsPackageHints(parsingResult);
			T.logInfo("Preparing sub-behavior state machines...");
			that.ensureSubbehaviorsReady(full_manifest, function(success, failed_key) {
				if (!success) {
					let error_string = "Failed to prepare sub-behavior state machines";
					if (failed_key != undefined) {
						error_string += " (" + failed_key + ")";
					}
					T.logError(error_string);
					callback(error_string);
					return;
				}
				try {
					applyParsingResult(parsingResult, full_manifest);
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
			}, legacy_package_hints);
		});
	}

	this.loadBehaviorInterface = function(behavior_data, callback) {
		try {
			var parsingResult = IO.CodeParser.parseSMInterface(behavior_data.codefile_content);
			callback(parsingResult);
		} catch (err) {
			T.logError("Failed to parse behavior interface of " + behavior_data.name + ": " + err);
			process.nextTick(() => {
				callback(undefined);
			});
			return;
		}
	}

	this.updateManualSections = function(callback) {
		var names = Behavior.createNames();
		var package_name = names.rosnode_name;
		ROS.getPackagePythonPath(package_name, (folder_path) => {
			if (folder_path == undefined) {
				process.nextTick(() => {
					callback();
				});
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
		let parsingResult;
		try {
			parsingResult = IO.CodeParser.parseCode(manifest.codefile_content);
		} catch (err) {
			console.log(`\x1b[91mCode parsing failed: ${err}\x1b[0m`);
			process.nextTick(() => {
				callback(undefined);
			});
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
		manifest.contains.forEach(function(entry) {
			var resolved = resolveContainedBehaviorReference(manifest, entry, "loadBehaviorDependencies");
			var be_key = resolved.be_key;

			if (!ignore_list.contains(be_key)) {
				ignore_list.push(be_key);
				var lib_entry = resolved.lib_entry;
				if (lib_entry == undefined) {
					T.logWarn("loadBehaviorDependencies: cannot find sub-behavior '" + be_key + "'");
					return;
				}
				WS.Behaviorlib.updateEntry(lib_entry);
				ignore_list = that.loadBehaviorDependencies(lib_entry.getBehaviorManifest(), ignore_list);
			}
		});
		return ignore_list;
	}

}) ();
