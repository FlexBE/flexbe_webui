const CommandLib = new (function() {

	var getBehaviorNameCounts = function() {
		var counts = {};
		WS.Behaviorlib.getBehaviorList().forEach(function(entry) {
			var name = entry.getBehaviorName();
			counts[name] = (counts[name] || 0) + 1;
		});
		return counts;
	}

	var formatBehaviorCommandTarget = function(entry, name_counts) {
		if ((name_counts[entry.getBehaviorName()] || 0) > 1) {
			return entry.getStatePackage() + "::" + entry.getBehaviorName();
		}
		return entry.getBehaviorName();
	}

	var resolveBehaviorCommandTarget = function(target) {
		var separator_index = target.indexOf("::");
		if (separator_index !== -1) {
			var pkg = target.slice(0, separator_index);
			var behavior_name = target.slice(separator_index + 2);
			var exact = WS.Behaviorlib.getByKey(pkg, behavior_name);
			if (exact == undefined) {
				T.logWarn("Behavior '" + target + "' not found.");
			}
			return exact;
		}

		var matches = WS.Behaviorlib.getBehaviorList().filter(function(entry) {
			return entry.getBehaviorName() == target;
		});
		if (matches.length == 0) {
			T.logWarn("Behavior '" + target + "' not found.");
			return undefined;
		}
		if (matches.length > 1) {
			var name_counts = getBehaviorNameCounts();
			T.logError("Behavior name '" + target + "' is ambiguous. Use one of: "
				+ matches.map(function(entry) { return formatBehaviorCommandTarget(entry, name_counts); }).join(", "));
			return undefined;
		}
		return matches[0];
	}

	var getBehaviorCommandCompletions = function(exclude_current_behavior) {
		var name_counts = getBehaviorNameCounts();
		var current_name = Behavior.getBehaviorName ? Behavior.getBehaviorName() : undefined;
		var current_pkg = Behavior.getBehaviorPackage ? Behavior.getBehaviorPackage() : undefined;

		return WS.Behaviorlib.getBehaviorList().filter(function(entry) {
			if (!exclude_current_behavior) {
				return true;
			}
			return !(entry.getBehaviorName() == current_name && entry.getStatePackage() == current_pkg);
		}).map(function(entry) {
			return formatBehaviorCommandTarget(entry, name_counts);
		});
	}

	var command_library = [
		{
			desc: "commands",
			match: /^(cmd|commands|help)$/,
			impl: function(args) {
				UI.Tools.printAvailableCommands();
				UI.Tools.notifyRosCommand('commands');
			},
			text: "Lists all available commands."
		},
		{
			desc: "findStateUsage [state_type]",
			match: /^findStateUsage[( ]["']?([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)["']?\)?$/,
			impl: function(args) {
				Scripts.findStateUsage(args[1]);
				UI.Tools.notifyRosCommand('findStateUsage');
			},
			text: "Searches in all behaviors for instantiations of the given type.",
			completions: [function() { return WS.Statelib.getTypeList(); }]
		},
		{
			desc: "statemachine [new_name]",
			match: /^statemachine[( ]?["']?([a-zA-Z0-9_]+)?["']?\)?$/,
			impl: function(args) {
				if (UI.Statemachine.isReadonly()) return;
				Tools.createStatemachine(args[1]);
				UI.Tools.notifyRosCommand('statemachine');
			},
			text: "Creates a new state machine with the given name out of all selected states.",
			completions: [function() { return UI.Statemachine.getSelectedStates().map(function(s) { return s.getStateName(); }); }]
		},
		{
			desc: "synthesize [sm_name] i: [initial] g: [goal]",
			match: /^synthesize ([a-zA-Z0-9_]+) i: ?(.+?) g: ?(.+?)$/,
			impl: function(args) {
				if (UI.Statemachine.isReadonly()) {
					console.log("command_lib: synthesize SM is read only!");
					return;
				}
				var initial_condition = args[2];
				var goal = args[3];
				var path = UI.Statemachine.getDisplayedSM().getStatePath() + "/" + args[1];
				console.log("command_lib: synthesize SM IC=[" + initial_condition + "] goal = [" + goal + "] path='" + path + "' ....");
				RC.PubSub.requestBehaviorSynthesis( path, UI.Settings.getSynthesisSystem(), goal, initial_condition,
													['finished', 'failed'], function() { UI.Tools.notifyRosCommand('synthesize'); });
			},
			text: "Synthesizes a new state machine.",
			completions: [
				function() { return UI.Statemachine.getDisplayedSM().getStates().filter(function(s) { return s instanceof Statemachine; }).map(function(sm) { return sm.getStateName(); }) },
				function() { return ['step', 'stand_prep', 'stand', 'manipulate', 'walk']; },
				function() { return ['step', 'stand_prep', 'stand', 'manipulate', 'walk']; }
			]
		},
		{
			desc: "note [text]",
			match: /^note ?([^\n]+)?$/,
			impl: function(args) {
				if (UI.Statemachine.isReadonly()) return;
				var text = (args[1] != undefined)? args[1] : '';
				var note = new Note(text);
				note.setContainerPath(UI.Statemachine.getDisplayedSM().getStatePath());
				Behavior.addCommentNote(note);
				UI.Statemachine.refreshView();
				UI.Tools.notifyRosCommand('note');
			},
			text: "Adds a new note to the currently displayed state machine."
		},
		{
			desc: "autoconnect",
			match: /^autoconnect$/,
			impl: function(args) {
				if (UI.Statemachine.isReadonly()) return;
				Tools.autoconnect();
				UI.Tools.notifyRosCommand('autoconnect');
			},
			text: "Automatically connects obvious outcomes."
		},
		{
			desc: "autolayout",
			match: /^autolayout$/,
			impl: function(args) {
				if (UI.Statemachine.isReadonly()) return;
				UI.Statemachine.applyLayeredGraphLayout();
				UI.Statemachine.refreshView();
				UI.Tools.notifyRosCommand('autolayout');
			},
			text: "Applies a force-based graph layout to arrange states."
		},
		{
			desc: "save",
			match: /^save$/,
			impl: function(args) {
				UI.Menu.saveBehaviorClicked();
				T.show(); // make sure terminal does not get collapsed by saving
			},
			text: "Saves the current behavior."
		},
		{
			desc: "load [behavior]",
			match: /^load ([^\n]+)$/,
			impl: function(args) {
				if (RC.Controller.isRunning()) {
					T.logWarn('Unable to load a behavior while executing another one.');
					return;
				}
				var entry = resolveBehaviorCommandTarget(args[1]);
				if (entry == undefined) {
					return;
				}
				var manifest = entry.getBehaviorManifest();
				IO.BehaviorLoader.loadBehavior(manifest);
				UI.Menu.toDashboardClicked();
			},
			text: "Loads the behavior with the given name.",
			completions: [
				function() { return getBehaviorCommandCompletions(false); }

			]
		},
		{
			desc: "update [behavior]",
			match: /^update ([^\n]+)$/,
			impl: function(args) {
				if (RC.Controller.isReadonly()) {
					T.logWarn("Cannot update a behavior while executing another one.");
					return;
				}
				var entry = resolveBehaviorCommandTarget(args[1]);
				if (entry == undefined) {
					return;
				}
				var entry_name = entry.getBehaviorName();
				if (entry_name == Behavior.getBehaviorName() && entry.getStatePackage() == Behavior.getBehaviorPackage()) {
					T.logWarn("Cannot update the behavior which is currently loaded. Please use 'load "+args[1]+"' instead.");
					return;
				}
				WS.Behaviorlib.updateEntry(entry, function() {
					var updated_entry = arguments[0];
					if (updated_entry == undefined) {
						return;
					}

					var updated_states = 0;
					var refreshNestedBehaviorStates = function(container) {
						container.getStates().forEach(function(state) {
							if (
								state instanceof BehaviorState
								&& state.getStatePackage() == updated_entry.getStatePackage()
								&& state.getBehaviorName() == updated_entry.getBehaviorName()
							) {
								state.updateBehaviorDefinition(updated_entry);
								updated_states += 1;
								return;
							}
							if (state instanceof Statemachine) {
								refreshNestedBehaviorStates(state);
							}
						});
					};

					refreshNestedBehaviorStates(Behavior.getStatemachine());
					if (updated_states > 0 && UI.Menu.isPageStatemachine()) {
						UI.Statemachine.refreshView();
					}
					UI.Tools.notifyRosCommand('update');
				});
			},
			text: "Updates the implementation of a behavior in the background (except the one currently loaded).",
			completions: [
				function() { return getBehaviorCommandCompletions(true); }

			]
		},
		{
			desc: "attach [autonomy_level]",
			match: /^attach ?(-?\d+)?$/,
			impl: function(args) {
				var selection_box = document.getElementById("selection_rc_autonomy");
				var selected_option = selection_box.options[selection_box.selectedIndex];
				if (args[1] == undefined && selected_option == undefined) {
					T.logWarn('No autonomy level available to attach with.');
					return;
				}
				var autonomy_level = (args[1] != undefined)? parseInt(args[1]) : parseInt(selected_option.value);
				if (!RC.Controller.isActive()) {
					if (!RC.Controller.isExternal()) {
						T.logWarn('No behavior running to attach to.');
						return;
					}
					RC.PubSub.sendAttachBehavior(autonomy_level);

					UI.RuntimeControl.displayBehaviorFeedback(4, "Attaching to behavior...");
				} else {
					T.logInfo('Already attached. Updating the autonomy level only.');
					UI.Tools.notifyRosCommand('attach');
				}
				UI.Menu.toControlClicked();

				// update the autonomy level selection box to reflect the newly set level
				for (var optionIndex = 0; optionIndex < selection_box.options.length; optionIndex++) {
					if (parseInt(selection_box.options[optionIndex].value) == autonomy_level) {
						selection_box.selectedIndex = optionIndex;
						break;
					}
				}
				UI.RuntimeControl.updateAutonomySelectionBoxColor();
			},
			text: "Attaches the GUI to a running behavior if possible."
		},
		{
			desc: "lock [level]",
			match: /^lock ?(-?\d+)?$/,
			impl: function(args) {
				if (!RC.Controller.isRunning() || !RC.Controller.isActive()) {
					T.logWarn('Cannot lock: no unlocked behavior is currently running.');
					return;
				}
				var idx = (args[1] != undefined)? parseInt(args[1]) : 0;
				var sel = document.getElementById("selection_rc_lock_layer");
				idx = (idx < 0)? idx + sel.options.length : idx;
				if (idx < 0 || idx >= sel.options.length) {
					T.logWarn('Cannot lock: the selected lock level is out of range.');
					return;
				}
				sel.selectedIndex = idx;
				UI.RuntimeControl.behaviorLockClicked();
			},
			text: "Locks the currently running behavior."
		},
		{
			desc: "unlock",
			match: /^unlock$/,
			impl: function(args) {
				if (!RC.Controller.isRunning() || RC.Controller.needSwitch()) {
					T.logWarn('Cannot unlock: no unchanged locked behavior is currently running.');
					return;
				}
				UI.RuntimeControl.behaviorLockClicked();
			},
			text: "Unlocks the currently locked behavior."
		},
		{
			desc: "switch",
			match: /^(switch|goforit)$/,
			impl: function(args) {
				if (!RC.Controller.isRunning() || RC.Controller.isActive() || !RC.Controller.needSwitch()) {
					T.logWarn('Cannot switch: no locked behavior is waiting for runtime changes.');
					return;
				}
				UI.RuntimeControl.behaviorLockClicked();
			},
			text: "Applies runtime modifications to the currently locked behavior."
		},
		{
			desc: "edit [path]",
			match: /^edit ?([^\n]+)?$/,
			impl: function(args) {
				var path = (args[1] != undefined)? args[1] : '/';
				var sm = (path == '/')? Behavior.getStatemachine()
					: Behavior.getStatemachine().getStateByPath(path);
				if (sm == undefined || !(sm instanceof Statemachine)) {
					T.logWarn('Cannot open "' + path + '": it is not a state machine path.');
					return;
				}
				UI.Statemachine.setDisplayedSM(sm);
				UI.Menu.toStatemachineClicked();
				UI.Tools.notifyRosCommand('edit');
			},
			text: "Opens the container given by the specified path in the editor."
		}
	];


	this.load = function() {
		return command_library;
	}

}) ();
