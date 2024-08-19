UI.Tools = new (function() {
	var that = this;

	var command_history = [];
	var command_history_idx = 0;
	var command_library = CommandLib.load();

	var last_ros_command = undefined;

	Mousetrap.bind("ctrl+space", function(evt) {
		console.log(`Open tool icons ...`);
		evt.preventDefault();
		evt.stopPropagation();
		UI.Tools.toggle();
	}, 'keydown');
	Mousetrap.bind("ctrl+space", function(evt) {
		console.log(`Evaluate tool selection ...`);
		evt.preventDefault();
		evt.stopPropagation();
		UI.Tools.evaluate();
	}, 'keyup');

	var mouse = {x: 0, y: 0};
	document.addEventListener('mousemove', function(e){
		mouse.x = e.clientX || e.pageX;
		mouse.y = e.clientY || e.pageY
	}, false);

	var hover_mode = false;
	var closest_button = undefined;

	var id_list = ["dfg", "undo", "redo", "copy", "cut", "paste", "terminal", "save"];

	var hide_timeout = undefined;

	var getPanel = function() { return document.getElementById("tool_overlay"); }

	var placeButtonsCircular = function(radius, animate) {
		for (let i = 0; i < id_list.length; i++) {
			let d = document.createElement("div");
			d.setAttribute("class", "tool_overlay_button");
			getPanel().appendChild(d);
			let el = document.getElementById("tool_overlay_" + id_list[i]);
			let angle = -225 + i * 45;
			d.setAttribute("style", "transform: rotate(" + angle + "deg) translate(" + radius + "px) rotate(" + -angle + "deg);");
			let bb = d.getBoundingClientRect();
			let p = el.parentNode;
			el.setAttribute("style", "top: " + (bb.top - parseInt(p.style.top)) + "px; left: " + (bb.left - parseInt(p.style.left)) + "px;"
							+ (animate? "transition: all 0.2s ease;" : ""));
			p.removeChild(d);
		}
	}

	var getClosestButton = function() {
		let panel = getPanel();
		let angle = Math.atan2((mouse.y - (parseInt(panel.style.top) + 50)), (mouse.x - (parseInt(panel.style.left) + 50)));
		angle = angle * 180 / Math.PI;
		let snapped_angle = Math.round(angle / 45) * 45;
		let angle_index = (snapped_angle + 225) / 45;
		angle_index = angle_index % 8;
		return document.getElementById("tool_overlay_" + id_list[angle_index]);
	}

	var createHistoryContent = function() {
		let activities = ActivityTracer.getActivityList();
		let current = ActivityTracer.getCurrentIndex();
		let save = ActivityTracer.getLastSaveIndex();
		let changes = ActivityTracer.hasUnsavedChanges();

		let info = document.getElementById("history_info");
		info.innerHTML = "<b>" + Behavior.getBehaviorName() + "</b><br /><br />";
		if (!changes) {
			info.innerHTML += "Last saved: <i>no changes</i><br />";
		} else if (save == 0) {
			info.innerHTML += "Last saved: <i>never</i><br />";
		} else {
			let savetime = Math.round((Date.now() - activities[save].time) / 60000);
			info.innerHTML += "Last saved: <i>" + savetime + " min ago</i><br />";
		}

		let list = document.getElementById("history_list");
		list.innerHTML = "";
		for (let i = activities.length - 1; i >= 0; i--) {
			let a = (i > 0)? activities[i] : {description: "<i>no changes</i>"};
			let entry = document.createElement("div");
			entry.setAttribute("class", "history_element");
			entry.innerHTML = ((i == current)? "> " : "") + ((i == save)? "# " : "") + a.description;
			list.appendChild(entry);

			const addListener = function(index) {
				entry.addEventListener('click', function() {
					ActivityTracer.goToIndex(index);
					createHistoryContent();
				});
			};
			addListener(i);
		}
	}


	this.printAvailableCommands = function() {
		T.clearLog();
		T.show();
		T.logInfo("The following commands are available:");
		command_library.forEach(function(c) {
			T.logInfo(c.desc + '<font style="color: #999; font-style: italic;"> - ' + c.text + '</font>');
		});
	}

	this.display = function() {
		if (RC.Controller.isReadonly()) return;

		if (hide_timeout != undefined) clearTimeout(hide_timeout);
		let panel = getPanel();

		let position_top = Math.min(Math.max(mouse.y - 50, 120), window.innerHeight - 210);
		let position_left = Math.min(Math.max(mouse.x - 50, 120), window.innerWidth - 210);

		panel.style.display = "block";
		panel.style.top = position_top + "px";
		panel.style.left = position_left + "px";
		placeButtonsCircular(300, false);

		setTimeout(function() {
			placeButtonsCircular(120, true);
			panel.style.opacity = "1";
		}, 10);
	}

	this.hide = function() {
		getPanel().style.opacity = "0";
		hide_timeout = setTimeout(function() {
			getPanel().style.display = "none";
			document.getElementById("command_overlay").style.display = "none";
		}, 200);
		placeButtonsCircular(300, true);

		document.getElementById("tool_input_command").blur();
		document.getElementById("tool_input_command").value = "";

		document.getElementById("history_overlay").style.left = "-295px";
		document.getElementById("command_overlay").style.bottom = "0px";
		document.getElementById("command_overlay").style.opacity = "0";
		document.getElementById("command_overlay_suggestions").style.display = "none";
		document.getElementById("command_overlay_suggestions").style.opacity = "0";
	}

	this.toggle = function() {
		if (RC.Controller.isReadonly()) return;

		let panel = getPanel();
		if (!hover_mode) {
			if (panel.style.display != "block") {
				that.display();
				hover_mode = true;
			} else {
				that.hide();
			}
		} else {
			let mouse_distance = Math.sqrt(Math.pow(mouse.x - (parseInt(panel.style.left) + 50), 2) + Math.pow(mouse.y - (parseInt(panel.style.top) + 50), 2));
			if (mouse_distance > 170) {
				let new_closest_button = getClosestButton();
				if (closest_button != new_closest_button) {
					if (closest_button != undefined)
						closest_button.style.backgroundColor = "";
					closest_button = new_closest_button;
					closest_button.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
				}
			} else {
				if (closest_button != undefined) {
					closest_button.style.backgroundColor = "";
					closest_button = undefined;
				}
			}
		}
	}

	this.evaluate = function() {
		let panel = getPanel();
		if (hover_mode) {
			let will_stay = true;
			hover_mode = false;
			if (closest_button != undefined) {
				will_stay = false;
				closest_button.click();
				closest_button.style.backgroundColor = "";
				closest_button = undefined;
			} else {
				// triggering keydown again the first time is slow, so make sure we dont miss any selection
				let mouse_distance = Math.sqrt(Math.pow(mouse.x - (parseInt(panel.style.left) + 50), 2) + Math.pow(mouse.y - (parseInt(panel.style.top) + 50), 2));
				if (mouse_distance > 170) {
					getClosestButton().click();
					will_stay = false;
				}
			}
			if (will_stay) {
				// display panels
				document.getElementById("history_overlay").style.left = "-15px";
				ActivityTracer.setUpdateCallback(createHistoryContent);
				createHistoryContent();

				that.displayCommandInput();
			}
		}

	}

	this.displayCommandInput = function() {
		document.getElementById("command_overlay").style.display = "block";
		document.getElementById("command_overlay_suggestions").style.display = "block";
		setTimeout(function() {
			document.getElementById("command_overlay").style.bottom = "20px";
			document.getElementById("command_overlay").style.opacity = "1";
			document.getElementById("tool_input_command").focus({ preventScroll: true });
		}, 10);
	}

	this.tryExecuteCommand = function(cmd) {
		try {
			command_history.push(cmd);
			command_history_idx = command_history.length;

			for (let i = 0; i < command_library.length; i++) {
				let c = command_library[i];
				let args = cmd.match(c.match);
				if (args != null) {
					c.impl(args);
					return true;
				}
			}

			if (cmd != "") {
				T.clearLog();
				T.show();
				T.logWarn("Command not recognized: " + cmd);
			}

		} catch (err) {
			T.logError(err.toString());
		}
		return false;
	}

	this.commandListener = function(event) {
		let hide = false;
		let cmd_input = document.getElementById("tool_input_command");
		let cmd = cmd_input.value;

		// process command
		if (event.key === 'Enter') { // enter
			hide = true;
			that.tryExecuteCommand(cmd);
		}

		// close overlay
		if (event.key === 'Escape' || (event.key === ' ' && event.ctrlKey)) { // esc or ctrl+space
			hide = true;
		}

		// navigate history
		if (event.key === 'ArrowUp') { // up arrow
				if (command_history_idx > 0) {
				command_history_idx -= 1;
				cmd = command_history[command_history_idx];
				cmd_input.value = cmd;
			}
		}
		if (event.key === 'ArrowDown') { // down arrow
			if (command_history_idx < command_history.length) {
				command_history_idx += 1;
				cmd = (command_history_idx < command_history.length)? command_history[command_history_idx] : "";
				cmd_input.value = cmd;
			}
		}

		// add autocomplete
		let suggestions = (cmd == "")? [] : Autocomplete.generateCommandList(cmd, command_library);
		document.getElementById("command_overlay_suggestions").innerHTML = "";
		let displaySuggestions = function(s) {
			let div = document.createElement("div");
			div.setAttribute("class", "command_overlay_suggestion");
			div.innerText = s.text;
			document.getElementById("command_overlay_suggestions").appendChild(div);
		};
		suggestions.forEach(displaySuggestions);
		if (suggestions.length == 0) {
			document.getElementById("command_overlay_suggestions").style.opacity = "0";
		} else {
			document.getElementById("command_overlay_suggestions").style.opacity = "1";
		}
		if (event.key === 'ArrowRight' // right arrow
			&& cmd_input.selectionStart == cmd.length
			&& suggestions.length > 0)
		{
			if (cmd.indexOf(" ") == -1) {
				cmd_input.value = cmd + Autocomplete.getSameFill(cmd, suggestions);
			} else {
				let suggested_cmd = command_library.findElement(function(el) { return el.desc == suggestions[0].text; });
				let count_spaces = cmd.split(" ").length - 1;
				let split_suggested_cmd = suggested_cmd.desc.split(" ");
				if (split_suggested_cmd[count_spaces].endsWith(":")) {
					cmd_input.value += split_suggested_cmd[count_spaces] + " ";
				} else {
					let arg_idx = count_spaces - cmd.split(":").length;
					let current_arg = cmd.substr(cmd.lastIndexOf(" ") + 1);
					if (suggested_cmd.completions != undefined && suggested_cmd.completions[arg_idx] != undefined) {
						let completions = suggested_cmd.completions[arg_idx]().filter(function(el) {
							return el.startsWith(current_arg);
						}).map(function(el) {
							return {text: el, hint: "", fill: el};
						});
						if (completions.length > 0) {
							let fill = Autocomplete.getSameFill(current_arg, completions);
							if (fill.length > 0 || completions.length == 1) {
								cmd_input.value = cmd.substr(0, cmd.lastIndexOf(" ") + 1) + current_arg + fill;
							} else {
								document.getElementById("command_overlay_suggestions").innerHTML = "";
								completions.sort(function(a,b) { return a.text.toLowerCase().localeCompare(b.text.toLowerCase()); });
								completions.forEach(displaySuggestions);
							}
						} else  {
							document.getElementById("command_overlay_suggestions").innerHTML = '<div class="command_overlay_suggestion"><i>no suggestions</i></div>';
						}
					} else  {
						document.getElementById("command_overlay_suggestions").innerHTML = '<div class="command_overlay_suggestion"><i>no suggestions</i></div>';
					}
				}
			}
		}

		if (hide) {
			that.hide();
		}
	}

	this.undoClicked = function() {
		ActivityTracer.undo();
		that.hide();
	}

	this.redoClicked = function() {
		ActivityTracer.redo();
		that.hide();
	}

	this.copyClicked = function() {
		Tools.copy();
		that.hide();
	}

	this.pasteClicked = function() {
		Tools.paste();
		that.hide();
	}

	this.cutClicked = function() {
		Tools.cut();
		that.hide();
	}

	this.dfgClicked = function() {
		UI.Statemachine.toggleDataflow();
		that.hide();
	}

	this.terminalClicked = function() {
		UI.Panels.Terminal.show();
		that.hide();
	}

	this.saveClicked = function() {
		UI.Menu.saveBehaviorClicked();
		that.hide();
	}

	this.startRosCommand = function(cmd) {
		last_ros_command = cmd;
		that.tryExecuteCommand(cmd);
	}

	this.notifyRosCommand = function(cmd) {
		if (last_ros_command != undefined && last_ros_command.startsWith(cmd)) {
			RC.PubSub.sendRosNotification(last_ros_command);
			last_ros_command = undefined;
		}
	}

	this.confirmUIExit = async function() {
		if (RC.Controller.isRunning()) {
			console.log(`\x1b[91mCannot exit UI while a behavior is running!\x1b[0m`);
			T.logError("Cannot exit UI while a behavior is running!");
			this.sendShutdownConfirmation(false); // needed to clear logic
			return false;
		} else if (RC.Controller.isReadonly()) {
			console.log(`\x1b[91mCannot exit UI while a behavior is starting (read only)!\x1b[0m`);
			T.logError("Cannot exit UI while a behavior is starting (read only)!");
			this.sendShutdownConfirmation(false); // needed to clear logic
			return false;
		} else if (ActivityTracer.hasUnsavedChanges()) {
			console.log('request confirmation with unsaved changes.');
			let userConfirmed = await UI.Tools.customConfirm("Current behavior has changes.<br>Press Confirm if you want to exit the UI<br> and throw changes away?");

			// Check the user's response
			if (userConfirmed) {
				// User clicked OK
				console.log("User confirmed desire to exit and toss changes!");
				RC.PubSub.shutdown();
				this.sendShutdownConfirmation(true);
				return true;
			} else {
				// User clicked Cancel
				console.log("User canceled the exit action.");
				this.sendShutdownConfirmation(false); // needed to clear logic
				return false;
			}

		}
		console.log(`OK to exit UI ...`);
		RC.PubSub.shutdown();
		this.sendShutdownConfirmation(true);
		return true;
	}

	this.sendShutdownConfirmation = function(allow_shutdown) {
		// console.log(`confirming that shutdown is allowed ${allow_shutdown}`);
		API.post("confirm_shutdown", allow_shutdown, (result) => {
			if (result) {
				console.log(`Response from shutdown confirmation ${result['confirm']}`);
			} else {
				console.log("Invalid response from shutdown confirmation!");
			}
		});
	}

	this.customConfirm = async function(confirmMsg) {
		return new Promise((resolve) => {
			const modal = document.getElementById('custom_confirm_dialog');
			const msgSpan = document.getElementById('custom_confirm_dialog_msg');
			const cancelBtn = document.getElementById('custom_confirm_dialog_cancel_btn');
			const confirmBtn = document.getElementById('custom_confirm_dialog_confirm_btn');

			msgSpan.innerHTML = confirmMsg;
			modal.style.display = "block";

			function closeModalClicked(event) {
				event.stopImmediatePropagation(); // this modal is in control for now
				event.preventDefault();
				modal.style.display = "none";
				modal.removeEventListener('click', closeModalClicked, true);
				modal.removeEventListener('keydown', closeModalKeyPress, true);
				let result = false;
				if (event.target === confirmBtn) {
					// otherwise we click outside, which counts as cancel
					result = true;
				}
				resolve(result);
			}

			function closeModalKeyPress(event) {
				event.stopImmediatePropagation(); // this modal is in control for now
				event.preventDefault();
				if (!modal.contains(event.target)) {
					return;
				}

				if (event.key === 'Tab') {
					// Move focus between confirmation buttons
					document.activeElement == cancelBtn ? confirmBtn.focus({preventScroll: true}) : cancelBtn.focus({preventScroll: true});
					return; // no resolution yet
				} else if (event.key === 'Esc') {
					event.target = cancelBtn; // Escape always cancels
					closeModalClicked(event);
				} else if (event.key === 'Enter' || event.key === ' ') {
					closeModalClicked(event);
				}
			}
			modal.addEventListener('keydown', closeModalKeyPress, true); // keydown to match default Tab
			modal.addEventListener('click', closeModalClicked, true);
			cancelBtn.focus({preventScroll: true}); // Focus on the Cancel button by default
		});
	}

	this.customAcknowledge = async function(confirmMsg) {
		return new Promise((resolve) => {
			const modal = document.getElementById('custom_acknowledge_dialog');
			const msgSpan = document.getElementById('custom_acknowledge_dialog_msg');
			const confirmBtn = document.getElementById('custom_acknowledge_dialog_confirm_btn');

			msgSpan.innerHTML = confirmMsg;
			modal.style.display = "block";

			function closeModalClicked(event) {
				event.stopImmediatePropagation(); // this modal is in control for now
				event.preventDefault();
				modal.style.display = "none";
				modal.removeEventListener('click', closeModalClicked, true);
				modal.removeEventListener('keydown', closeModalKeyPress, true);
				resolve(true);
			}

			function closeModalKeyPress(event) {
				event.stopImmediatePropagation(); // this modal is in control for now
				event.preventDefault();
				console.log(`closeModalKeyPress '${event.target.id}' (${document.activeElement.id})`)

				if (!modal.contains(event.target)) {
					return;
				}
				if (event.key === 'Tab') {
					// Keep focus on confirmation buttons
					confirmBtn.focus({preventScroll: true}); // the button by default after event listeners defined
					return; // no resolution yet
				} else if (event.key === 'Esc') {
					event.target = confirmBtn; // Escape always cancels
					closeModalClicked(event);
				} else if (event.key === 'Enter' || event.key === ' ') {
					closeModalClicked(event);
				}
			}
			modal.addEventListener('keydown', closeModalKeyPress, true); // keydown to match default Tab
			modal.addEventListener('click', closeModalClicked, true);
			confirmBtn.focus({preventScroll: true}); // the button by default after event listeners defined
			console.log(`defined acknowledge dialog with focus '${confirmBtn.id}' (${document.activeElement.id})`)
		});
	}

	this.handleTopLevelKeyDown = function(event) {
		if (event.key === "Tab") {
			// No other panel is handling tabs, so move to main panel
			if (event.target.id === '') {
				//console.log(`Tab keydown captured from target '${event.target.id}' at top level (focus='${document.activeElement.id}') - set focus to toolbar!`);
				UI.Menu.updateFocus();
				event.preventDefault(); // Prevent the default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				// } else {
				// 	console.log(`Tab keydown seen at top-level from target '${event.target.id}' but did not capture!`);
			}
			return;
		} else if (event.key === "Enter") {
			if (event.target.id === 'dashboard' || event.target.id === 'statemachine' || event.target.id === 'runtimecontrol') {
				//console.log(`top level saw '${event.key}' keydown from target '${event.target.id}' - open command entry!`);
				event.preventDefault(); // Prevent the default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				document.getElementById('tool_input_command').addEventListener('keydown', UI.Tools.commandListener);
				that.displayCommandInput();
				return;
			}
		}
	}

	this.handleTopLevelKeyUp = function(event) {
		if (event.key === "Tab") {
			// No other panel is handling tabs, so move to main panel
			if (event.target.id === '') {
				event.preventDefault(); // Prevent the default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				return;
			} else {
				return;
			}
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault(); // Prevent the default action
			return;
		}
	}


}) ();