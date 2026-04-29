UI.Menu = new (function() {
	var that = this;
	var keys = ["db", "sm", "rc", "se"];

	var current_page = "db";
	var tab_targets = [];
	var listeners_to_cleanup = [];

	this.updateFocus = async function() {
		if (document.activeElement) {
			document.activeElement.blur();
		}
		UI.Dashboard.removeTabHandling();
		UI.RuntimeControl.removeTabHandling();
		UI.Settings.removeTabHandling();

		if (current_page === 'db') {
			UI.Dashboard.setupTabHandling();
		} else if (current_page === 'sm') {
			UI.Statemachine.setupTabHandling();
		} else if (current_page === 'rc') {
			UI.RuntimeControl.setupTabHandling();
		} else if (current_page === 'se') {
			UI.Settings.setupTabHandling();
		} else {
			console.log(`\x1b[91m UI.Menu - unknown page '${current_page}'\x1b[0m`);
		}
	}

	this.resize = function() {
		if (current_page === 'db') {
			that.toDashboardClicked();
		} else if (current_page === 'sm') {
			that.toStatemachineClicked();
		} else if (current_page === 'rc') {
			that.toControlClicked();
		} else if (current_page === 'se') {
			that.toSettingsClicked();
		} else {
			console.log(`\x1b[91m UI.Menu - unknown page '${current_page}' - cannot resize!\x1b[0m`);
		}
	}


	this.setFocus = function(target) {
		for (let i=0; i<keys.length; ++i) {
			let key = keys[i];
			let active = (key == target)? "_active" : "";
			document.getElementById("button_to_" + key).setAttribute("class", "category_button" + active);
			document.getElementById("button_to_" + key).children[0].setAttribute("src", "img/" + key + active + ".png");
		}
		console.log(`\x1b[94mSetting focus to '${target}' from '${current_page}'\x1b[0m`);
		current_page = target;
		that.updateFocus();
	}

	var button_config_db = [
		[	//  for global key bindings only define once (set others to undefined)
			//  key bindings must be unique across all pages
			//  name,   image, function, key binding, global (vs. tied to single page)
			["New Behavior", "file_new", function() { UI.Menu.newBehaviorClicked(); }, "ctrl+n", false],
			["Load Behavior", "file_load", function() { UI.Menu.loadBehaviorClicked(); }, "ctrl+l", false],
			["Save Behavior", "file_save", function() { UI.Menu.saveBehaviorClicked(); }, "ctrl+s", true]
		],
		[
			["Edit Behavior Code", "page_edit", function() { UI.Menu.scEditClicked(); }, "ctrl+e", true],
			["View Behavior Code", "page_view", function() { UI.Menu.scViewClicked(); }, "ctrl+b", true]
		],
		[
			["Check Behavior", "check", function() { UI.Menu.checkBehaviorClicked(); }, "ctrl+k", true]
		]
	];
	var button_config_sm = [
		[
			["Add State", "add", function() { UI.Menu.addStateClicked(); }, "ctrl+1", false],
			["Add Behavior", "add", function() { UI.Menu.addBehaviorClicked(); }, "ctrl+2", false],
			["Add Container", "add", function() { UI.Menu.addStatemachineClicked(); }, "ctrl+3", false]
		],
		[
			["Data Flow Graph", "dataflow", function() { UI.Statemachine.toggleDataflow(); }, "ctrl+d", false],
			["Check Behavior", "check", function() { UI.Menu.checkBehaviorClicked(); }, undefined, true],
			["Save Behavior", "file_save", function() { UI.Menu.saveBehaviorClicked(); }, undefined, true]
		],
		[
			["Undo", "undo", function(event) { ActivityTracer.undo(); }, "ctrl+z", true],
			["Redo", "redo", function(event) { ActivityTracer.redo(); }, "ctrl+shift+z", true],
			["Reset", "cross", function(event) { ActivityTracer.resetToSave(); }, undefined, false]
		],
		[
			["Hide Comments", "note", function() { UI.Statemachine.toggleComments(); }, "ctrl+h", false],
			["Write Comment", "note_add", function() { UI.Menu.addCommentClicked(); }, "ctrl+4", false]
		],
		[
			["Fade Outcomes", "outcome", function() { UI.Statemachine.toggleOutcomes(); }, "ctrl+f", false],
			["Auto Layout", "group_selection", function() { UI.Menu.autoLayoutClicked(); }, undefined, false],
			["Auto-Connect", "autoconnect", function(event) { Tools.autoconnect(); }, "ctrl+a", false],
			["Group Selection", "group_selection", function(event) { Tools.groupSelection(); }, "ctrl+g", false]
		]
	];
	var button_config_rc = [
		[
			["Toggle Terminal", "title_terminal", function() { UI.Menu.terminalClicked(); }, "ctrl+t", true],
			//["Test", "title_terminal", function(event) { ROS.test(); }, undefined]
		]
	];
	var button_config_se = [
		[
			["Toggle Terminal", "title_terminal", function() { UI.Menu.terminalClicked(); }, undefined, true]
		],
		[
			["Import Configuration", "settings_import", function() { UI.Settings.importConfiguration(); }, undefined, false],
			["Export Configuration", "settings_export", function() { UI.Settings.exportConfiguration(); }, undefined, false]
		]
	];

	var setMenuButtons = function(config) {
		let panel = document.getElementById("title_button_panel");
		panel.innerHTML = "";
		that.clearChildElements();
		for (let c=0; c<config.length; ++c) {
			let column = document.createElement("div");
			column.setAttribute("class", "tool_category");
			let table = document.createElement("table");
			table.setAttribute("cellspacing", "0");
			table.setAttribute("cellpadding", "0");
			for (let r=0; r<config[c].length; ++r) {
				let button = config[c][r];
				let tr = document.createElement("tr");
				let td = document.createElement("td");
				td.setAttribute("class", "tool_button");
				td.setAttribute("id", "tool_button " + button[0]);
				td.setAttribute("tabIndex", "0");
				td.innerHTML =
					'<table cellpadding="0" cellspacing="0"><tr><td valign="middle">' +
						'<img src="img/' + button[1] + '.png" />' +
					'</td><td valign="middle" style="padding-left:5px">' +
						button[0] +
					'</td></tr></table>';
				const clickHandler = function(event) {
					event.stopPropagation();
					event.preventDefault();
					button[2]();
				}
				td.addEventListener("click", clickHandler);
				listeners_to_cleanup.push({'element': td, 'listener_type': 'click', 'handler': clickHandler});

				tr.appendChild(td);
				table.appendChild(tr);
			}
			column.appendChild(table);
			panel.appendChild(column);
		}
	}

	this.isPageDashboard = function() { return current_page == "db"; }
	this.isPageStatemachine = function() { return current_page == "sm"; }
	this.isPageControl = function() { return current_page == "rc"; }
	this.isPageSettings = function() { return current_page == "se"; }

	this.configureKeybindings = function() {
		let bindShortcut = (typeof Mousetrap.bindGlobal === "function")
			? Mousetrap.bindGlobal.bind(Mousetrap)
			: Mousetrap.bind.bind(Mousetrap);
		[[button_config_db, that.isPageDashboard],
		 [button_config_sm, that.isPageStatemachine],
		 [button_config_rc, that.isPageControl],
		 [button_config_se, that.isPageSettings]
		].forEach(function(element) {
			element[0].forEach(function(column) {
				column.forEach(function(button) {
					if (button[3] == undefined) return;
					bindShortcut(button[3], function(evt) {
						evt.preventDefault();
						if (!button[4] && !element[1]()) {
							console.log(`\x1b[93mIgnoring ${button[3]} on this page!\x1b[0m`);
							return;
						}
						console.log(`Invoking ${button[3]} to ${button[0]}`);
						button[2]();
					});
					console.log(` binding '${button[3]}' to '${button[0]}' action (global=${button[4]})`);
				});
			});
		});
	}

	this.toDashboardClicked = function(event=undefined) {
		if (event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
		UI.Panels.hideAllPanels();
		T.hide();
		const containerWidth = document.getElementById("dashboard").parentElement.offsetWidth;
		document.getElementById("dashboard").style.left = "0px";
		document.getElementById("statemachine").style.left = `${containerWidth + 50}px`;
		document.getElementById("runtimecontrol").style.left = `${(containerWidth + 50) * 2}px`;
		document.getElementById("settings").style.left = `${(containerWidth + 50) * 3}px`;
		that.setFocus("db");
		setMenuButtons(button_config_db);
		console.log(`db=${document.getElementById("dashboard").style.left} `
					+ `sm=${document.getElementById("statemachine").style.left}`
					+ `rc=${document.getElementById("runtimecontrol").style.left}`
					+ `se=${document.getElementById("settings").style.left}`
					)
	}

	this.toStatemachineClicked = function(event=undefined) {
		if (event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
		UI.Panels.hideAllPanels();
		T.hide();
		const containerWidth = document.getElementById("statemachine").parentElement.offsetWidth;
		document.getElementById("dashboard").style.left = `${-containerWidth - 50}px`;
		document.getElementById("statemachine").style.left = "0px";
		document.getElementById("runtimecontrol").style.left = `${containerWidth + 50}px`;
		document.getElementById("settings").style.left = `${(containerWidth + 50) * 2}px`;
		that.setFocus("sm");
		setMenuButtons(button_config_sm);
		UI.Statemachine.refreshView();
		console.log(`db=${document.getElementById("dashboard").style.left} `
					+ `sm=${document.getElementById("statemachine").style.left}`
					+ `rc=${document.getElementById("runtimecontrol").style.left}`
					+ `se=${document.getElementById("settings").style.left}`
					)
	}

	this.toControlClicked = function(event=undefined) {
		if (event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
		UI.Panels.hideAllPanels();
		T.hide();
		const containerWidth = document.getElementById("runtimecontrol").parentElement.offsetWidth;
		document.getElementById("dashboard").style.left = `${(-containerWidth - 50) * 2}px`;
		document.getElementById("statemachine").style.left = `${-containerWidth - 50}px`;
		document.getElementById("runtimecontrol").style.left = "0px";
		document.getElementById("settings").style.left = `${containerWidth + 50}px`;;
		that.setFocus("rc");
		setMenuButtons(button_config_rc);

		console.log(`db=${document.getElementById("dashboard").style.left} `
					+ `sm=${document.getElementById("statemachine").style.left}`
					+ `rc=${document.getElementById("runtimecontrol").style.left}`
					+ `se=${document.getElementById("settings").style.left}`
					)
	}

	this.toSettingsClicked = function(event=undefined) {
		if (event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
		UI.Panels.hideAllPanels();
		T.hide();
		const containerWidth = document.getElementById("settings").parentElement.offsetWidth;
		document.getElementById("dashboard").style.left = `${(-containerWidth - 50) * 3}px`;
		document.getElementById("statemachine").style.left = `${(-containerWidth - 50) * 2}px`;
		document.getElementById("runtimecontrol").style.left = `${-containerWidth - 50}px`;
		document.getElementById("settings").style.left = "0px";
		that.setFocus("se");
		setMenuButtons(button_config_se);
		console.log(`db=${document.getElementById("dashboard").style.left} `
					+ `sm=${document.getElementById("statemachine").style.left}`
					+ `rc=${document.getElementById("runtimecontrol").style.left}`
					+ `se=${document.getElementById("settings").style.left}`
					)
	}

	this.displayRuntimeStatus = function(status) {
		txt = document.getElementById("runtime_status_txt");
		txt.innerHTML = status;
		img = document.getElementById("runtime_status_img");
		color = "#aaa";
		switch(status) {
			case 'offline': img.setAttribute("src", "img/link_break.png"); color = "#aaa"; break;
			case 'disconnected': img.setAttribute("src", "img/cross.png"); color = "#d66"; break;
			case 'online': img.setAttribute("src", "img/link.png"); color = "#aaa"; break;
			case 'running': img.setAttribute("src", "img/tick.png"); color = "#3a3"; break;
			case 'locked': img.setAttribute("src", "img/lock.png"); color = "#b85"; break;
			case 'message': img.setAttribute("src", "img/information.png"); color = "#66b"; break;
			case 'warning': img.setAttribute("src", "img/warning.png"); color = "#b85"; break;
			case 'error': img.setAttribute("src", "img/error.png"); color = "#d66"; break;
		}
		txt.style.color = color;
	}

	this.displayOCSStatus = function(status) {
		txt = document.getElementById("ocs_status_txt");
		txt.innerHTML = status;
		img = document.getElementById("ocs_status_img");
		color = "#aaa";
		switch(status) {
			case 'offline': img.setAttribute("src", "img/link_break.png"); color = "#aaa"; break;
			case 'disconnected': img.setAttribute("src", "img/cross.png"); color = "#d66"; break;
			case 'online': img.setAttribute("src", "img/link.png"); color = "#aaa"; break;
			case 'running': img.setAttribute("src", "img/tick.png"); color = "#3a3"; break;
			case 'locked': img.setAttribute("src", "img/lock.png"); color = "#b85"; break;
			case 'message': img.setAttribute("src", "img/information.png"); color = "#66b"; break;
			case 'warning': img.setAttribute("src", "img/warning.png"); color = "#b85"; break;
			case 'error': img.setAttribute("src", "img/error.png"); color = "#d66"; break;
		}
		txt.style.color = color;
	}

	this.scEditClicked = function() {
		let names = Behavior.createNames();
		let package_name = Behavior.getBehaviorPackage();

		try {
			if (names.manifest_path == undefined) throw "No behavior selected!"
			console.log("Edit behavior (on server computer) ");
			console.log(names);

			let file_path = `${names.manifest_path}/${names.file_name}.py`
			let editor_command = UI.Settings.getEditorCommand(file_path); //.split(' ');
			let json_file_dict = {};
			json_file_dict["editor"] = editor_command;
			json_file_dict["package"] = package_name;
			json_file_dict["file"] = names.file_name;
			json_file_dict["manifest_path"] = names.manifest_path;
			json_file_dict["line"] = ''; // Not using line for now
			UI.Tools.openFileInEditor(json_file_dict, "Behavior opened in file editor.", "Failed to open the behavior code!");
		} catch (err) {
			T.logError("Unable to open behavior in editor: " + err);
		}

	}

	this.scViewClicked = function() {
		let names = Behavior.createNames();
		let package_name = Behavior.getBehaviorPackage();

		try {
			if (names.manifest_path == undefined) throw "No behavior selected!"

			if (ActivityTracer.hasUnsavedChanges()) throw "Save before viewing!"

			console.log(`View behavior : ${JSON.stringify(names)}`);

			let file_path = `${names.manifest_path}/${names.file_name}.py`
			let json_file_dict = {};
			json_file_dict["package"] = package_name;
			json_file_dict["file"] = names.file_name;
			json_file_dict["manifest_path"] = names.manifest_path;
			UI.Tools.openFileInSourceViewer(
				json_file_dict,
				names.behavior_name,
				`${package_name}/${names.file_name}`,
				"Behavior opened in file viewer.",
				"Failed to open the behavior code!"
			);
		} catch (err) {
			T.logError("Unable to open behavior in editor: " + err);
		}
	}

	this.addStateClicked = function() {
		if (UI.Statemachine.isReadonly()) return;

		UI.Panels.AddState.show();
	}

	this.addBehaviorClicked = function() {
		if (UI.Statemachine.isReadonly()) return;

		UI.Panels.SelectBehavior.setSelectionCallback(function(manifest) {
			let be_def = WS.Behaviorlib.getByKey(manifest.rosnode_name, manifest.name);
			if (be_def == undefined) {
				T.logError("Unable to find behavior definition for '" + manifest.rosnode_name + "::" + manifest.name + "'");
				return;
			}
			be_def.ensureBSMReady(function(success) {
				if (!success) {
					T.logError("Failed to prepare behavior state machine for '" + manifest.name + "'");
					return;
				}
				// Also ensure sub-behaviors of this behavior have their SMs ready
				IO.BehaviorLoader.ensureSubbehaviorsReady(manifest, function(ready, failed_key) {
					if (!ready) {
						let error_string = "Failed to prepare sub-behavior state machines for '" + manifest.name + "'";
						if (failed_key != undefined) {
							error_string += " (" + failed_key + ")";
						}
						T.logError(error_string);
						return;
					}
					let be = new BehaviorState(manifest.name, be_def, []);
					be.setStateName(Tools.getUniqueName(UI.Statemachine.getDisplayedSM(), be.getStateName()));
					UI.Statemachine.getDisplayedSM().addState(be);
					UI.Statemachine.refreshView();
					UI.Panels.StateProperties.displayStateProperties(be);

					let be_name = manifest.name;
					let be_pkg = manifest.rosnode_name;
					let state_path = be.getStatePath();
					let container_path = be.getContainer().getStatePath();

					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_ADD,
						"Added new state taken from behavior " + manifest.name,
						function() {
							let state = Behavior.getStatemachine().getStateByPath(state_path);
							state.getContainer().removeState(state);
							if (UI.Panels.StateProperties.isCurrentState(state)) {
								UI.Panels.StateProperties.hide();
							}
							UI.Statemachine.refreshView();
						},
						function() {
							let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
							let redo_state = new BehaviorState(be_name, WS.Behaviorlib.getByKey(be_pkg, be_name), []);
							container.addState(redo_state);
							UI.Statemachine.refreshView();
						}
					);
				}); // ensureSubbehaviorsReady
			}); // ensureBSMReady
		});
		UI.Panels.SelectBehavior.enableHover();
		UI.Panels.SelectBehavior.show();
	}

	this.addStatemachineClicked = function() {
		if (UI.Statemachine.isReadonly()) return;

		let sm_def = new WS.StateMachineDefinition(['finished', 'failed'], [], []);
		let state_name = Tools.getUniqueName(UI.Statemachine.getDisplayedSM(), "Container");
		let sm = new Statemachine(state_name, sm_def);
		UI.Statemachine.getDisplayedSM().addState(sm);
		UI.Statemachine.refreshView();
		UI.Panels.StateProperties.displayStateProperties(sm);

		let state_path = sm.getStatePath();
		let container_path = sm.getContainer().getStatePath();

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_ADD,
			"Added new container",
			function() {
				let state = Behavior.getStatemachine().getStateByPath(state_path);
				if (UI.Statemachine.getDisplayedSM().getStatePath() == state.getStatePath()) {
					UI.Statemachine.setDisplayedSM(state.getContainer());
				}
				state.getContainer().removeState(state);
				if (UI.Panels.StateProperties.isCurrentState(state)) {
					UI.Panels.StateProperties.hide();
				}
				UI.Statemachine.refreshView();
			},
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let redo_state = new Statemachine(state_name, new WS.StateMachineDefinition(['finished', 'failed'], [], []));
				container.addState(redo_state);
				UI.Statemachine.refreshView();
			}
		);

		return sm;
	}

	this.terminalClicked = function() {
		UI.Panels.Terminal.toggle();
	}

	this.saveBehaviorClicked = async function() {
		let validation_report = {fatal_errors: [], warnings: []};
		let check_error_string = undefined;
		if (Behavior.isReadonly()) {
			check_error_string = "behavior has been loaded from a read-only file";
		} else {
			validation_report = Checking.checkBehaviorReport();
			check_error_string = validation_report.fatal_errors[0];
		}
		if (check_error_string != undefined) {
			T.clearLog();
			T.show();
			T.logError("Unable to save behavior: " + check_error_string);
			return;
		}
		let save_as = false;
		let behavior_file_name = Behavior.getFileName();
		let current_behavior_name = Behavior.getBehaviorName();
		if (behavior_file_name != undefined && current_behavior_name != undefined && current_behavior_name.trim() != '') {
			let current_file_base = behavior_file_name.replace(/\.py$/i, '');
			let current_file_identity = current_file_base.split(/[\\/]/).pop();
			let desired_file_base = current_behavior_name.toLowerCase().replace(/[^\w]/g, "_") + '_sm';
			if (current_file_identity != desired_file_base) {
				let old_target = current_file_base;
				let new_target = desired_file_base;
				let choice = await UI.Tools.customSaveWithRenameDecision(
					"Behavior name changed from current file identity.\n\n"
					+ "Choose how to save:\n"
					+ `Save: keep current file name:\n${old_target}\n\n`
					+ `Save As: use new file name:\n${new_target}`
				);
				if (choice === 'cancel') {
					T.logInfo("Save canceled.");
					return;
				}
				save_as = (choice === 'save_as');
				if (!save_as) {
					T.logWarn("Saving to existing file name; behavior display name differs from file identity.");
				}
			}
		}

		IO.BehaviorSaver.saveStateMachine({
			save_as: save_as,
			keep_terminal_open: validation_report.warnings.length > 0,
		});

		if (validation_report.warnings.length > 0) {
			T.logWarn(`Saving with ${validation_report.warnings.length} non-fatal validation warning(s).`);
			validation_report.warnings.forEach(function(warning) {
				T.logWarn(warning);
			});
		}
		ActivityTracer.addSave();
	}

	this.newBehaviorClicked = async function() {
		if (RC.Controller.isReadonly()) return;

		// abort behavior execution if running
		if (ActivityTracer.hasUnsavedChanges()) {
			// Display the confirmation dialog
			let userConfirmed = await UI.Tools.customConfirm("Current behavior has changes.<br><br>Press Confirm if you want to proceed\nand throw changes away.");

			// Check the user's response
			if (userConfirmed) {
				// User clicked OK
				console.log("User confirmed desire to start behavior and toss changes!");
			} else {
				// User clicked Cancel
				console.log("User canceled the new behavior action.");
				return; // prevent change
			}
		}

		Behavior.resetBehavior();
		UI.Dashboard.resetAllFields();
		UI.Statemachine.resetStatemachine();

		// make sure a new behavior always starts at the dashboard
		UI.Menu.toDashboardClicked();
		UI.Panels.setActivePanel(UI.Panels.NO_PANEL);

		await UI.Dashboard.addBehaviorOutcome('finished');
		await UI.Dashboard.addBehaviorOutcome('failed');

		ActivityTracer.resetActivities();
		UI.Dashboard.setupTabHandling();
	}

	this.loadBehaviorClicked = async function() {
		if (RC.Controller.isReadonly()) return;
		if (ActivityTracer.hasUnsavedChanges()) {
			// Display the confirmation dialog
			let userConfirmed = await UI.Tools.customConfirm("Current behavior has changes.<br><br>Press Confirm if you want to proceed\nand throw changes away.");

			// Check the user's response
			if (userConfirmed) {
				// User clicked OK
				console.log("User confirmed desire to load new behavior and toss changes!");
			} else {
				// User clicked Cancel
				console.log("User canceled the load action.");
				return;
			}
		}

		UI.Panels.SelectBehavior.setSelectionCallback(function(manifest) {
			IO.BehaviorLoader.loadBehavior(manifest, () => {});
			if (current_page === "db") UI.Dashboard.setupTabHandling();
		});

		UI.Panels.SelectBehavior.enableHover();
		UI.Panels.SelectBehavior.show();
	}

	this.checkBehaviorClicked = function() {
		T.clearLog();
		T.show();
		T.logInfo("Performing behavior checks...");
		let validation_report = Checking.checkBehaviorReport();
		if (validation_report.fatal_errors.length > 0) {
			T.logError("Found error: " + validation_report.fatal_errors[0]);
		} else {
			if (validation_report.warnings.length > 0) {
				T.logWarn(`Behavior is valid with ${validation_report.warnings.length} non-fatal warning(s).`);
			} else {
				T.logInfo("Behavior is valid!");
			}
		}
	}

	this.addCommentClicked = function() {
		if (UI.Statemachine.isReadonly()) return;
		if (Behavior.getCommentNotes().findElement(function(n) { return n.getContent() == ""; }) != undefined) return;

		let note = new Note("");
		note.setContainerPath(UI.Statemachine.getDisplayedSM().getStatePath());
		Behavior.addCommentNote(note);
		UI.Statemachine.refreshView();
	}

	this.autoLayoutClicked = function() {
		if (UI.Statemachine.isReadonly()) return;
		UI.Statemachine.requestAutoLayout();
	}

	this.setupTabHandling = function() {
		if (document.activeElement) {
			document.activeElement.blur();
		}
		tab_targets = updateTabTargets("top-level-toolbar");
		if (tab_targets.length > 0) {
			tab_targets[0].focus({ preventScroll: true });
			// console.log(`set focus to '${document.activeElement ? document.activeElement.id : 'undefined'}' (${tab_targets[0].id})`)
		}
	}

	this.removeTabHandling = function() {
		// console.log(`\x1b[94mDeactivate TAB handling for top-level-toolbar ...\x1b[0m`);
		if (tab_targets.length > 0) {
			tab_targets.length = 0;
			if (document.activeElement) {
				document.activeElement.blur();
			}
		}
	}

	this.clearChildElements = function(filter='') {
		try {
			const elementsToRemove = new Set();
			listeners_to_cleanup.forEach(({element, listener_type, handler}) => {
				if (element.id.startsWith(filter)) {
					element.removeEventListener(listener_type, handler);
					elementsToRemove.add(element);
				}
			});
			listeners_to_cleanup = listeners_to_cleanup.filter(({ element, listener_type, handler}) => {
				if (!elementsToRemove.has(element)) {
					return true;
				}
				return false;
			});

			const elementsToRemoveArray = Array.from(elementsToRemove);
			elementsToRemoveArray.forEach(child => {
				if (child.parentNode) {
					child.parentNode.removeChild(child);
				}
				elementsToRemove.delete(child);
			});
		} catch (err) {
			console.log(`\x1b[91m Error: ${err} \xb1[93m ${err.stack}]]`)
		}
	}

	var updateTabTargets = function(panel_id) {
		let select_tags = '.tool_button, .category_button, .category_button_active';

		let panel = document.getElementById(panel_id);
		let targets = Array.from(panel.querySelectorAll(select_tags));
		targets = targets.filter(function(el) {
			if (el.tabIndex === -1) return false;
			if (el.id == '') return false;
			let parentDiv = el.parentElement;
			while (parentDiv) {
				if (parentDiv.id == panel.id) return true;
				parentDiv = parentDiv.parentElement;
			}
			return false; // never matched our panel id
		});

		targets.sort(function(a, b) {
			if (a.tabIndex === b.tabIndex) {
				// if tabIndex not set, then use DOCUMENT_POSITION_PRECEDING flag test (b proceeds a)
				return a.compareDocumentPosition(b) & 2 ? 1 : -1;
			}
			return a.tabIndex - b.tabIndex;
		});

		return targets;
	}

	// Define the event listener function
	this.handleKeyDown = function(event) {
		//Tools.validateUniqueIDs(); // for debugging html changes
		if (event.key === "Tab") {
			// console.log(`handling tab for top-level-toolbar from '${event.target.id}' ...`);
			// Panel is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers

			let match = undefined;
			let match_ndx = -1;

			// Regular top-level-toolbar TAB handling
			if (tab_targets.length == 0) return;
			if (document.activeElement) {
				for (let i = 0; i < tab_targets.length; i++) {
					if (document.activeElement && (document.activeElement.id == tab_targets[i].id)) {
						match = tab_targets[i];
						match_ndx = i;
						break;
					}
				}
			}
			if (match) {
				match_ndx = event.shiftKey
									? (match_ndx - 1 + tab_targets.length) % tab_targets.length
									: (match_ndx + 1) % tab_targets.length;
				new_match = tab_targets[match_ndx];
				new_match.focus({ preventScroll: true });
			} else {
				tab_targets[0].focus({ preventScroll: true }); // Move focus to the first input
			}
			return;
		} else if (event.key == 'Enter' || event.key == ' ') {
			if (event.target.id.startsWith('tool_button ')
				|| event.target.id.startsWith('button_to_')) {
				// Select this element on keydown (before something shifts focus)
				event.preventDefault(); // Prevent the default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				document.getElementById(event.target.id).click();
				return;
			}
		}
		//console.log(`Top-level-toolbar saw key down event '${event.key}' from '${event.target.id}' but did not capture`);
	}
	this.handleKeyUp = function(event) {
		if (event.key === "Tab") {
			// top-level menu is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
	}

}) ();
