IO.BehaviorLoader = new (function() {
	var that = this;

	var deferCallback = function(callback) {
		if (callback == undefined) {
			return;
		}
		var args = Array.prototype.slice.call(arguments, 1);
		var invoke = function() {
			callback.apply(undefined, args);
		};
		if (typeof queueMicrotask == 'function') {
			queueMicrotask(invoke);
			return;
		}
		if (typeof setTimeout == 'function') {
			setTimeout(invoke, 0);
			return;
		}
		invoke();
	}

	var findUniqueBehaviorByName = function(behavior_name) {
		var matches = WS.Behaviorlib.getBehaviorList().filter(function(element) {
			return element.getBehaviorName() == behavior_name;
		});
		if (matches.length == 1) {
			return matches[0];
		}
		return undefined;
	}

	var addLegacyContainsPackageHint = function(hints, behavior_name, behavior_pkg) {
		if (behavior_name == undefined || behavior_pkg == undefined) {
			return;
		}
		if (hints[behavior_name] == undefined) {
			hints[behavior_name] = [];
		}
		if (!Array.isArray(hints[behavior_name])) {
			hints[behavior_name] = [hints[behavior_name]];
		}
		// Preserve occurrence order, including duplicates, so repeated legacy
		// contains entries can be matched back to the Python import sequence.
		hints[behavior_name].push(behavior_pkg);
	}

	var consumeLegacyContainsPackageHint = function(legacy_package_hints, behavior_name) {
		if (legacy_package_hints == undefined) {
			return undefined;
		}
		var hint_entry = legacy_package_hints[behavior_name];
		if (hint_entry == undefined || hint_entry == null) {
			return undefined;
		}
		if (!Array.isArray(hint_entry)) {
			return hint_entry;
		}
		if (hint_entry.length == 0) {
			return undefined;
		}
		return hint_entry.shift();
	}

	var splitQualifiedPackageClassRef = function(ref) {
		if (ref == undefined) {
			return undefined;
		}
		var separator_index = ref.lastIndexOf("__");
		if (separator_index <= 0 || separator_index >= ref.length - 2) {
			return undefined;
		}
		return {
			pkg: ref.slice(0, separator_index),
			class_name: ref.slice(separator_index + 2)
		};
	}

	var resolveBehaviorEntryByClassRef = function(class_ref, state_type_imports) {
		if (class_ref == undefined) {
			return undefined;
		}

		var qualified_ref = splitQualifiedPackageClassRef(class_ref);
		if (qualified_ref != undefined && WS.Behaviorlib.getByClassAndPackage != undefined) {
			return WS.Behaviorlib.getByClassAndPackage(qualified_ref.pkg, qualified_ref.class_name);
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
				addLegacyContainsPackageHint(hints, behavior_entry.getBehaviorName(), behavior_entry.getStatePackage());
			});
		});
		return hints;
	}

	var inferLegacyContainsPackageHints = function(manifest, context_label) {
		if (manifest == undefined || !manifest.codefile_content || IO.CodeParser == undefined || IO.CodeParser.parseCode == undefined) {
			return {};
		}
		try {
			return buildLegacyContainsPackageHints(IO.CodeParser.parseCode(manifest.codefile_content, manifest.class_name));
		} catch (err) {
			T.logWarn(context_label + ": unable to infer Python source package hints for '" + manifest.name + "': " + err);
			return {};
		}
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

		var hinted_pkg = consumeLegacyContainsPackageHint(legacy_package_hints, be_name);
		if (hinted_pkg != undefined) {
			T.logWarn(context_label + ": sub-behavior '" + be_name + "' has no package in manifest; "
				+ "using Python source hint package '" + hinted_pkg + "'. Please resave to make this explicit.");
			var hinted_entry = WS.Behaviorlib.getByKey(hinted_pkg, be_name);
			if (hinted_entry != undefined) {
				return {
					be_name: be_name,
					be_key: hinted_pkg + '::' + be_name,
					lib_entry: hinted_entry
				};
			}
			T.logWarn(context_label + ": Python source hint resolved sub-behavior '" + be_name + "' to package '"
				+ hinted_pkg + "', but no matching behavior entry was found. Falling back to legacy lookup.");
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
				+ container_pkg + "'; checking unique-name fallback.");
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
		var visited = new Set();
		var ensureManifest = function(current_manifest, current_hints, done) {
			if (!current_manifest || !current_manifest.contains || current_manifest.contains.length === 0) {
				done(true);
				return;
			}

			var entries = current_manifest.contains.slice();
			var index = 0;
			var advance = function() {
				if (index >= entries.length) {
					done(true);
					return;
				}

				var entry = entries[index++];
				var resolved = resolveContainedBehaviorReference(
					current_manifest, entry, "ensureSubbehaviorsReady", current_hints
				);
				var be_key = resolved.be_key;
				if (visited.has(be_key)) {
					advance();
					return;
				}
				visited.add(be_key);

				var lib_entry = resolved.lib_entry;
				if (!lib_entry) {
					T.logWarn("ensureSubbehaviorsReady: cannot find sub-behavior '" + be_key + "'");
					done(false, be_key);
					return;
				}

				lib_entry.ensureBSMReady(function(success) {
					if (!success) {
						done(false, lib_entry.getStatePackage() + "::" + lib_entry.getBehaviorName());
						return;
					}
					var child_manifest = lib_entry.getBehaviorManifest();
					var child_hints = inferLegacyContainsPackageHints(child_manifest, "ensureSubbehaviorsReady");
					ensureManifest(child_manifest, child_hints, function(child_ready, child_failed_key) {
						if (!child_ready) {
							done(false, child_failed_key);
							return;
						}
						advance();
					});
				});
			};

			advance();
		};

		var root_hints = legacy_package_hints || inferLegacyContainsPackageHints(manifest, "ensureSubbehaviorsReady");
		ensureManifest(manifest, root_hints, callback);
	}

	this.loadBehavior = function(manifest, callback) {
		callback = callback || function() {};
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
				parsingResult = IO.CodeParser.parseCode(full_manifest.codefile_content, full_manifest.class_name);
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
			var parsingResult = IO.CodeParser.parseSMInterface(behavior_data.codefile_content, behavior_data.class_name);
			deferCallback(callback, parsingResult);
		} catch (err) {
			T.logError("Failed to parse behavior interface of " + behavior_data.name + ": " + err);
			deferCallback(callback, undefined);
		}
	}

	this.updateManualSections = function(callback) {
		var names = Behavior.createNames();
		var package_name = names.rosnode_name;
		ROS.getPackagePythonPath(package_name, (folder_path) => {
			if (folder_path == undefined) {
				deferCallback(callback);
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
					deferCallback(callback);
				}
			});
		});
	}

	this.parseBehaviorSM = function(manifest, callback) {
		console.log(`\x1b[92mPreparing sourcecode of behavior '${manifest.name}'\x1b[0m`);
		let parsingResult;
		try {
			parsingResult = IO.CodeParser.parseCode(manifest.codefile_content, manifest.class_name);
		} catch (err) {
			console.log(`\x1b[91mCode parsing failed: ${err}\x1b[0m`);
			deferCallback(callback, undefined);
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

	this.loadBehaviorDependencies = function(manifest, ignore_list, legacy_package_hints) {
		if (!manifest || !manifest.contains) return ignore_list;
		var current_hints = legacy_package_hints || inferLegacyContainsPackageHints(manifest, "loadBehaviorDependencies");
		manifest.contains.forEach(function(entry) {
			var resolved = resolveContainedBehaviorReference(manifest, entry, "loadBehaviorDependencies", current_hints);
			var be_key = resolved.be_key;

			if (ignore_list.indexOf(be_key) === -1) {
				ignore_list.push(be_key);
				var lib_entry = resolved.lib_entry;
				if (lib_entry == undefined) {
					T.logWarn("loadBehaviorDependencies: cannot find sub-behavior '" + be_key + "'");
					return;
				}
				WS.Behaviorlib.updateEntry(lib_entry);
				var child_manifest = lib_entry.getBehaviorManifest();
				var child_hints = inferLegacyContainsPackageHints(child_manifest, "loadBehaviorDependencies");
				ignore_list = that.loadBehaviorDependencies(child_manifest, ignore_list, child_hints);
			}
		});
		return ignore_list;
	}

}) ();
