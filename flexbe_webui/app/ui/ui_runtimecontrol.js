UI.RuntimeControl = new (function() {
	var that = this;

	var R = undefined;
	var background = undefined;
	var previous_states = [];
	var current_states = [];
	var previous_state = undefined;
	var income_transition = undefined;
	var current_state = undefined;
	var current_level = 0;
	var next_states = {};
	var outcome_transitions = [];
	var drawings = [];
	var status_label = undefined;
	var outcome_request = { outcome: undefined, target: undefined };

	var pending_outcome_requests = new Map();

	var force_redraw = false;

	var param_keys = [];
	var param_vals = [];

	var locked_state_path = "";

	var pause_behavior_toggle = true;
	var sync_ext_toggle = false;

	var tab_targets = [];

	this.updateDrawing = function() {
		drawings.forEach(function(element, i) {
			element.drawing.remove();
		});
		drawings = [];

		if (current_state == undefined) {
			return;
		}

		// Path
		//------
		drawings.push(new Drawable.ContainerPath(current_state.getContainer(), R, that.smDisplayHandler));

		// Current
		//---------
		let is_locked = RC.Controller.isLocked() && RC.Controller.isOnLockedPath(current_state.getStatePath());
		let current_state_drawing = that.createDrawing(current_state, Drawable.State.Mode.MAPPING, true, is_locked);
		let bbox = current_state_drawing.drawing.getBBox()
		current_state_drawing.drawing.translate(-bbox.x + (R.width - bbox.width) / 2, -bbox.y + (R.height - bbox.height) / 2);
		drawings.push(current_state_drawing);

		// Previous
		//----------
		let previous_state_drawing = undefined;
		if (previous_state != undefined) {
			previous_state_drawing = that.createDrawing(previous_state, Drawable.State.Mode.SIMPLE, false, false);
			let b = previous_state_drawing.drawing.getBBox();
			previous_state_drawing.drawing.translate(-b.x + 10, -b.y + (R.height - previous_state_drawing.drawing.getBBox().height) / 2);
			drawings.push(previous_state_drawing);
		}

		// Next
		//------
		let next_state_drawings = [];
		let next_states_list = Object.keys(next_states);
		next_states_list.forEach(function(key) {
			next_state_drawings.push(that.createDrawing(next_states[key].state, Drawable.State.Mode.SIMPLE, false, false));
		});

		// vertical position
		let offset_top = 0;
		let space = (R.height - next_state_drawings.reduce(function(prev, cur, i, a) {
			return prev + cur.drawing.getBBox().height;
		}, 0)) / (next_state_drawings.length + 1);

		// horizontal position
		let offset_left = R.width - next_state_drawings.reduce(function(prev, cur, i, a) {
			return Math.max(prev, cur.drawing.getBBox().width);
		}, 0) - 10;

		next_state_drawings.forEach(function(element, i) {
			offset_top += space;
			let b = element.drawing.getBBox();
			element.drawing.translate(-b.x + offset_left, -b.y + offset_top);
			offset_top += b.height;
			drawings.push(element);
		});

		// Transitions
		//-------------
		if (previous_state != undefined) {
			drawings.push(new Drawable.Transition(income_transition, R, true, drawings, false, false, Drawable.Transition.PATH_STRAIGHT, undefined, true));
		}

		let selected_drawings = drawings.filter(function(d) { return d != previous_state_drawing; });
		next_states_list.forEach(function(key) {
			new_transitions = []
			next_states[key].incoming.forEach(function(element) {
				let highlight = outcome_request.target != undefined && outcome_request.target == current_state.getStatePath() && outcome_request.outcome == element.getOutcome();

				if (highlight) that.drawStatusLabel("Onboard requested outcome: " + outcome_request.outcome);
				let dt = new Drawable.Transition(element, R, true, selected_drawings,
												highlight, false, Drawable.Transition.PATH_CURVE,
												undefined, true);
				new_transitions.forEach(function(ot) {
					if (!(dt.obj.getFrom().getStateName() == ot.obj.getFrom().getStateName() && dt.obj.getTo().getStateName() == ot.obj.getTo().getStateName())) {
						console.logError(` dt and ot are not from and to the same states! (?)`);
					}
					dt.merge(ot); // merge with prior for bubble offset calculations
				});
				new_transitions.push(dt);

				if (dt) {
					function handleOutcomeSelection(event) {
						let t = this.data("transition");
						if (RC.Sync.hasProcess("Transition")) {
							UI.Panels.Terminal.logWarn(`There is an unacknowledged transition still pending (resync to clear if required)!`);
							console.log(`pending requests: ${JSON.stringify(Array.from(pending_outcome_requests))}`);
							console.log(`returning before sending from '${t.getFrom().getStatePath()}' --> '${t.getOutcome()}'`);
							return;
						}
						dt.drawing.unclick(); // disable this transition from future requests
						dt.drawing.attr({cursor: 'default'}); //, fill: '#b994'});
						RC.PubSub.sendOutcomeCommand(t.getFrom(), t.getOutcome());
						that.drawStatusLabel("Forcing outcome: " + t.getOutcome());
						outcome_request.target = undefined;
						console.log(`\x1b[94m Forced outcome '${element.getOutcome()}' for '${current_state.getStatePath()}'\x1b[0m`);
					}
					dt.drawing
						.attr({'cursor': 'pointer', 'title': "Click to force outcome " + element.getOutcome()})
						.data("transition", dt.obj)
						.click(handleOutcomeSelection);
					new_transitions.push(dt);
				}
			})
			drawings.push(...new_transitions); // add grouped transitions to drawings list
		});

		bgcolor = current_state.isInsideDifferentBehavior()? '#fff3f6' : '#fff';
		background.attr({fill: bgcolor}).toBack();
	}

	this.drawStatusLabel = function(text) {
		if (status_label != undefined) status_label.remove();
		status_label = R.text(R.width / 2, R.height - 30, text)
			.attr({'font-size': 16, 'fill': 'gray'});
	}

	this.createDrawing = function(state_obj, mode, active, locked) {

		if (current_state == undefined) {
			return;
		}

		if (state_obj instanceof Statemachine) {
			let drawable = new Drawable.Statemachine(state_obj, R, true, mode, active, locked);
			if (active) {
				drawable.drawing.data("sm_path", state_obj.getStatePath());
				drawable.drawing.dblclick(function() {
					if (current_state == undefined) {
						console.log(`RC.RuntimeControl.createDrawing - invalid current state`);
						return;
					}
					if (current_state.getStatePath() == undefined) {
						console.log(`undefined state path '${current_state.getStatePath()}' for '${current_state.getStateName()}'`);
					}
					let child_ndx = current_states.indexOf(current_state);

					let child_state = current_states[child_ndx + 1];
					current_state = child_state;
					that.updateStateDisplayDepth(child_state.getStatePath());
				});
			}
			return drawable;
		}

		if (state_obj instanceof BehaviorState) {
			let drawable = new Drawable.BehaviorState(state_obj, R, true, mode, active, locked);
			if (active) {
				drawable.drawing.data("new_path", state_obj.getStatePath());
				drawable.drawing.dblclick(function() {
					let child_ndx = current_states.indexOf(current_state);
					let child_state = current_states[child_ndx + 1];
					current_state = child_state;
					that.updateStateDisplayDepth(child_state.getStatePath());
				});
			}
			return drawable;
		}

		if (state_obj.getStateClass() == ":OUTCOME" || state_obj.getStateClass() == ":CONDITION")
			return new Drawable.Outcome(state_obj, R, true, false);

		return new Drawable.State(state_obj, R, true, mode, active, locked);
	}

	this.smDisplayHandler = function() {
		if (current_state == undefined) {
			return;
		}
		let sm = this.data("statemachine");
		let current_relative_path = current_state.getStatePath().slice(sm.getStatePath().length + 1);
		let current_lower_name = current_relative_path.split("/")[0];
		let current_lower_path = sm.getStatePath() + "/" + current_lower_name;
		that.updateStateDisplayDepth(current_lower_path);
	}

	this.updateStateDisplayDepth = function(state_path) {
		let path_segments = state_path.split("/");
		current_level = path_segments.length - 1;
		document.getElementById("selection_rc_lock_layer").selectedIndex = document.getElementById("selection_rc_lock_layer").length - current_level;

		that.updateStateDisplay();
	}

	this.updateStateDisplay = function() {
		current_state = current_states[current_level];
		if (current_state == undefined) {
			that.updateDrawing();
			return;
		}

		previous_state = previous_states[current_level];
		if (previous_state != undefined) {
			income_transition = current_state.getContainer().getTransitions().findElement(function(element) {
				return element.getFrom().getStateName() == previous_state.getStateName() && element.getTo().getStateName() == current_state.getStateName();
			});
			if (income_transition == undefined) {
				previous_state = undefined;
			}
		}
		outcome_transitions = current_state.getContainer().getTransitions().filter(function(element) {
			return element.getFrom().getStateName() == current_state.getStateName();
		});

		// Get target states and corresponding transitions
		next_states = {};
		outcome_transitions.forEach(function(element, i) {
			let toState = element.getTo();
			let key = toState.getStatePath();
			if (!next_states[key]) {
				next_states[key] = {state: element.getTo(), incoming: []};
			}
			next_states[key].incoming.push(element);
		});

		// documentation
		that.setDocumentation(current_state);

		that.updateDrawing();
		if (force_redraw) {
			// Clear force redraw after sync request is processed
			force_redraw = false;
		}
	}

	this.setDocumentation = function(state) {
		if (state == undefined) {
			document.getElementById("runtime_documentation_text").innerHTML = "";
			return;
		}

		let state_type = state.getStateType();
		let doc = "";

		if (state instanceof Statemachine) {
			doc += "<b>Container</b><br /><br />";
			if (state.isConcurrent()) {
				doc += "Execution type: Concurrency<br />";
				doc += "<i>Parallel execution of all elements.</i><br />";
			} else if (state.isPriority()) {
				doc += "Execution type: Priority<br />";
				doc += "<i>Execution supersedes all other containers.</i><br />";
			} else {
				doc += "Execution type: Statemachine<br />";
				doc += "<i>Sequential execution based on outcomes.</i><br />";
			}
			doc += "<br />Double-click the displayed container symbol to look inside."
		} else if (state instanceof BehaviorState) {
			doc += "<b>" + state.getBehaviorName() + "</b> (Behavior)<br />";
			doc += WS.Behaviorlib.getByName(state.getBehaviorName()).getBehaviorDesc() + "<br />";
		} else if (WS.Statelib.getFromLib(state_type) != undefined) {
			doc += "<b>" + state_type + "</b><br />";
			doc += WS.Statelib.getFromLib(state_type).getStateDesc() + "<br />";
			let pkeys = state.getParameters();
			let pvals = state.getParameterValues();
			if (pkeys.length > 0) {
				doc += "<br />";
				doc += "<b>Parameter Values:</b><br />";
			}
			for (let i = 0; i < pkeys.length; i++) {
				doc += "<div style='font-family: monospace;'><b>" + pkeys[i] + "</b> = ";
				doc += pvals[i];
				let resolved = VarSolver.resolveVar(pvals[i], false);
				if (resolved !== false && !(resolved instanceof Array) && resolved != pvals[i]) {
					doc += " (" + resolved + ")</div>";
				}
			}
			doc += "<br /><br />";
			doc += "<b>Outcomes:</b><br />";
			WS.Statelib.getFromLib(state_type).getOutcomeDesc().forEach(outcome => {
				doc += "<div><b>" + outcome.name + "</b>: " + outcome.desc + "</div>";
			});
		}

		document.getElementById("runtime_documentation_text").innerHTML = doc;
	}

	this.resetStateDisplay = function() {
		current_level = 0;
		current_state = undefined
		current_states = [];
		previous_state = undefined;
		income_transition = undefined;
		next_states = {};
		outcome_transitions = [];
		that.setDocumentation(undefined);
	}

	this.createParameterTable = function() {
		let table = document.getElementById("rc_parameter_table");
		table.innerHTML = "";

		let params = Behavior.getBehaviorParameters();
		let embedded_behaviors = helper_collectEmbeddedBehaviors(Behavior.getStatemachine());
		for (let i = 0; i < embedded_behaviors.length; i++) {
			if (embedded_behaviors[i] == undefined) continue;
			let b = embedded_behaviors[i];
			let ps = b.getBehaviorManifest().params.filter(p => {
				return b.getParameterValues()[b.getParameters().indexOf(p.name)] == undefined;
			});
			params = params.concat(ps.filter(function(el) {
				return params.findElement(function(p) {
					return p.name == el.name;
				}) == undefined;
			}).map(function (el) {
				return {
					type: el.type,
					name: b.getStatePath().substr(1) + "/" + el.name,
					default: el.default,
					label: el.label,
					hint: el.hint,
					additional: el.additional
				};
			}));
		}

		if (params.length == 0) {
			table.innerHTML = "<i>The selected behavior supports no parameters.</i>";
			return;
		}

		for (let i=0; i<params.length; i++) {
			let name_td = document.createElement("td");
			name_td.setAttribute("width", "14%");
			name_td.setAttribute("height", "30");
			name_td.setAttribute("title", params[i].name);
			name_td.innerHTML = params[i].label + ":";

			let value_td = document.createElement("td");
			value_td.setAttribute("width", "60%");
			if (params[i].type == "enum") {
				let select = document.createElement("select");
				select.setAttribute("id", params[i].name);
				select.setAttribute("name", params[i].name);
				params[i].additional.forEach(function(opt) {
					select.innerHTML += '<option value="' + opt + '" ' + ((opt == params[i].default)? 'selected="selected"' : '') + '>' + opt + '</option>';
				});
				value_td.appendChild(select);
			} else if (params[i].type == "numeric") {
				let input = document.createElement("input");
				input.setAttribute("id", params[i].name);
				input.setAttribute("name", params[i].name);
				input.setAttribute("type", "number");
				input.setAttribute("value", params[i].default);
				input.setAttribute("min", params[i].additional.min);
				input.setAttribute("max", params[i].additional.max);
				const isFloat = (params[i].default.indexOf(".") != -1) ||
								(params[i].additional.min.indexOf(".") != -1) ||
								(params[i].additional.max.indexOf(".") != -1); // value or limit has decimal.
				let step = "1"; // default for integers
				if (isFloat) {
					const range =  parseFloat(params[i].additional.max) - parseFloat(params[i].additional.min);
					step = (range*0.025).toPrecision(3).toString();
				}
				input.setAttribute("step", step);
				value_td.appendChild(input);
			} else if (params[i].type == "boolean") {
				let input = document.createElement("input");
				input.setAttribute("id", params[i].name);
				input.setAttribute("name", params[i].name);
				input.setAttribute("type", "checkbox");
				if (params[i].default == "True") {
					input.setAttribute("checked", "checked");
				}
				value_td.appendChild(input);
			} else if (params[i].type == "text") {
				let input = document.createElement("input");
				input.setAttribute("id", params[i].name);
				input.setAttribute("name", params[i].name);
				input.setAttribute("type", "text");
				input.setAttribute("value", params[i].default);
				value_td.appendChild(input);
			} else if (params[i].type == "yaml") {
				let add_button = document.createElement("input");
				add_button.setAttribute("id", "yaml_button_" + i);
				add_button.setAttribute("type", "button");
				add_button.setAttribute("value", "...");
				add_button.addEventListener('click', function() {
					let button = this;
					chrome.fileSystem.chooseEntry({type: 'openFile'}, function(entry) {
						button.parentNode.parentNode.children[0].children[0].setAttribute("value", entry.name);
					});
				});

				let file_input = document.createElement("input");
				file_input.setAttribute("type", "text");
				file_input.setAttribute("value", params[i].default);
				file_input.setAttribute("key", params[i].additional.key);
				file_input.setAttribute("style", "width: 300px");

				let file_td = document.createElement("td");
				file_td.appendChild(file_input);
				let add_td = document.createElement("td");
				add_td.appendChild(add_button);
				let key_label_td = document.createElement("td");
				key_label_td.innerHTML = (params[i].additional.key != "")? "(key: " + params[i].additional.key + ")" : "";

				let yaml_tr = document.createElement("tr");
				yaml_tr.appendChild(file_td);
				//yaml_tr.appendChild(add_td);
				yaml_tr.appendChild(key_label_td);
				let yaml_table = document.createElement("table");
				yaml_table.appendChild(yaml_tr);
				value_td.appendChild(yaml_table);
			}

			let hint_td = document.createElement("td");
			hint_td.setAttribute("width", "25%");
			let text = params[i].hint;
			if (params[i].name.indexOf("/") != -1) {
				text += " (/" + params[i].name.substr(0, params[i].name.lastIndexOf("/")) + ")";
			}
			hint_td.innerHTML = '<font style="color: gray">' + text + '</font>';

			let tr = document.createElement("tr");
			tr.setAttribute("name", params[i].name);
			tr.setAttribute("type", params[i].type);
			tr.appendChild(name_td);
			tr.appendChild(value_td);
			tr.appendChild(hint_td);
			table.appendChild(tr);
		}
	}

	this.parseParameterConfig = function(callback) {
		let children = document.getElementById("rc_parameter_table").children;
		let tagsToGo = children.length;
		let result = [];

		let checkResult = function() {
			tagsToGo -= 1;
			if (tagsToGo == 0) callback(result);
		}

		for (let i = 0; i < children.length; i++) {
			let c = children[i];
			if (c.tagName != "TR") {
				checkResult();
				continue;
			}

			let name = c.getAttribute("name");
			let type = c.getAttribute("type");
			let value = "";
			if (type == "enum") {
				let select = c.children[1].children[0];
				value = select.options[select.selectedIndex].value;
				result.push({name: name, value: value});
				checkResult();
			} else if (type == "numeric") {
				value = c.children[1].children[0].value;
				result.push({name: name, value: value});
				checkResult();
			} else if (type == "boolean") {
				value = c.children[1].children[0].checked? "1" : "0";
				result.push({name: name, value: value});
				checkResult();
			} else if (type == "text") {
				value = c.children[1].children[0].value;
				result.push({name: name, value: value});
				checkResult();
			} else if (type == "yaml") {
				value = c.children[1].children[0].children[0].children[0].children[0].value;
				let key = c.children[1].children[0].children[0].children[0].children[0].getAttribute('key');
				result.push({name: "YAML:" + name, value: value + ":" + key});
				checkResult();
			}
		}
	}

	this.initializeStateDisplay = function() {
		that.hideDisplays();
		R = Raphael("runtime_state_display");
		background = R.rect(0, 0, R.width, R.height)
			.attr({fill: '#FFF', stroke: '#FFF'}).toBack();
	}

	this.hideDisplays = function() {
		document.getElementById("runtime_configuration_display").style.display = "none";
		document.getElementById("runtime_external_display").style.display = "none";
		document.getElementById("runtime_waiting_display").style.display = "none";
		document.getElementById("runtime_offline_display").style.display = "none";
		document.getElementById("runtime_no_behavior_display").style.display = "none";
		ActivityTracer.setUpdateCallback();
		that.setDocumentation(undefined);
		if (R != undefined) {
			R.remove();
			R = undefined;
			drawings = [];
			status_label = undefined;
			that.displayLockBehavior();
		}
	}


	//
	//  Interface
	// ===========
	this.setRosProperties = function(ns) {
		let status_disp = document.getElementById('rc_ros_prop_status');
		let connect_button = document.getElementById('button_rc_connect');
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

	this.connectClicked = function() {
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
	}

	this.resetRuntimeControl = function() {
		that.resetProgress();
	}

	this.recreateDrawingArea = function() {
		if (R != undefined) {
			R.remove();
			drawings = [];
			that.initializeStateDisplay();
			that.updateStateDisplay();
		}
	}

	this.refreshView = function() {
		if (R != undefined) {
			that.updateStateDisplay();
		}
	}

	this.setProgress = function(percent) {
		document.getElementById('progress_bar').style.transition = "all 0.5s linear";
		document.getElementById('progress_left').style.transition = "all 0.5s linear";
		document.getElementById('progress_bar').style.width = percent + "%";
		document.getElementById('progress_left').style.width = (100 - percent) + "%";
	}

	this.resetProgress = function() {
		document.getElementById('progress_bar').style.transition = "all 0s linear";
		document.getElementById('progress_left').style.transition = "all 0s linear";
		document.getElementById('progress_bar').style.width = "0%";
		document.getElementById('progress_left').style.width = "100%";
	}

	this.setProgressStatus = function(status) {
		let color = "";
		switch (status) {
			case RC.Sync.STATUS_WARN: color = "linear-gradient(#ff3, #dd2)"; break;
			case RC.Sync.STATUS_ERROR: color = "linear-gradient(#e86, #c64)"; break;
			default: color = "linear-gradient(#bf7, #9d5)"; break;
		}
		document.getElementById('progress_bar').style.background = color;
	}

	this.resetParameterTableClicked = function() {
		that.createParameterTable();
	}

	this.startBehaviorClicked = function() {
		if (document.getElementById('button_behavior_start').disabled) {
			T.logWarn(`Waiting for prior start request to have chance to complete!`);
			return;
		}
		document.getElementById('button_behavior_start').disabled = true;
		// Start button is reenabled in RC.Controller when state changes to Configuration

		that.parseParameterConfig(function (result) {
			param_keys = [];
			param_vals = [];
			result.forEach(function (r) {
				param_keys.push("/" + r.name);
				param_vals.push("" + r.value);
			});
			console.log("Got parameter values, starting behavior ...");
			let selection_box = document.getElementById("selection_rc_autonomy");
			let autonomy_value = parseInt(selection_box.options[selection_box.selectedIndex].value);
			RC.PubSub.sendBehaviorStart(param_keys, param_vals, autonomy_value);
		});


	}

	this.attachExternalClicked = function() {
		let selection_box = document.getElementById("selection_rc_autonomy");
		let autonomy_level = parseInt(selection_box.options[selection_box.selectedIndex].value);
		RC.PubSub.sendAttachBehavior(autonomy_level);

		UI.RuntimeControl.displayBehaviorFeedback(4, "Attaching to behavior...");
	}

	this.behaviorLockClicked = function() {
		if (!RC.Controller.isRunning()) return;

		if (RC.Controller.isActive()) {
			let selection_box = document.getElementById("selection_rc_lock_layer");
			locked_state_path = selection_box.options[selection_box.selectedIndex].getAttribute("path");
			RC.Controller.setLockedStatePath(locked_state_path);
			RC.PubSub.sendBehaviorLock(locked_state_path);
		} else if (RC.Controller.needSwitch()) {
			let selection_box = document.getElementById("selection_rc_autonomy");
			let autonomy_value = parseInt(selection_box.options[selection_box.selectedIndex].value);
			RC.PubSub.sendBehaviorUpdate(param_keys, param_vals, autonomy_value);
		} else {
			RC.PubSub.sendBehaviorUnlock(locked_state_path);
			RC.Sync.remove("Changes");
		}
	}

	this.updateAutonomySelectionBoxColor = function() {
		let selection_box = document.getElementById("selection_rc_autonomy");
		let value = parseInt(selection_box.options[selection_box.selectedIndex].value);
		switch (value) {
			case 0: selection_box.style.color = "black"; break;
			case 1: selection_box.style.color = "blue"; break;
			case 2: selection_box.style.color = "green"; break;
			case 3: selection_box.style.color = "red"; break;
		}
	}

	this.autonomySelectionChanged = function() {
		let selection_box = document.getElementById("selection_rc_autonomy");
		let value = parseInt(selection_box.options[selection_box.selectedIndex].value);
		that.updateAutonomySelectionBoxColor();
		if (RC.Controller.isConnected()) {
			RC.PubSub.sendAutonomyLevel(value);
		}
		//UI.RuntimeControl.displayBehaviorFeedback(4, "Changed autonomy to: " + ["No","Low","High","Full"][value]);
	}

	this.repeatBehaviorClicked = function() {
		if (!RC.Controller.isRunning()) return;

		RC.PubSub.sendRepeatBehavior();
	}

	this.pauseBehaviorClicked = function() {
		if (!RC.Controller.isRunning()) return;
		document.getElementById("button_behavior_pause").setAttribute("disabled", "disabled");

		if (pause_behavior_toggle) {
			RC.PubSub.sendPauseBehavior();
		} else {
			RC.PubSub.sendResumeBehavior();
		}
	}

	this.switchPauseButton = function() {
		pause_behavior_toggle = !pause_behavior_toggle;
		document.getElementById("button_behavior_pause").removeAttribute("disabled", "disabled");

		if (pause_behavior_toggle) {
			document.getElementById("button_behavior_pause").setAttribute("value", "Pause");
		} else {
			document.getElementById("button_behavior_pause").setAttribute("value", "Resume");
		}
	}

	this.resetPauseButton = function() {
		pause_behavior_toggle = true;
		document.getElementById("button_behavior_pause").removeAttribute("disabled", "disabled");
		document.getElementById("button_behavior_pause").setAttribute("value", "Pause");
	}

	this.preemptBehaviorClicked = function() {
		if (!RC.Controller.isConnected()) return;

		RC.PubSub.sendPreemptBehavior();
		UI.RuntimeControl.displayBehaviorFeedback(4, "Stopping behavior...");
		document.getElementById("cb_allow_preempt").checked = false;
		document.getElementById("button_behavior_preempt").setAttribute("disabled", "disabled");
		document.getElementById("button_behavior_preempt").style.color = "gray";
	}

	this.allowPreemptClicked = function(evt) {
		if(evt.target.checked) {
			document.getElementById("button_behavior_preempt").removeAttribute("disabled", "disabled");
			document.getElementById("button_behavior_preempt").style.color = "red";
		} else {
			document.getElementById("button_behavior_preempt").setAttribute("disabled", "disabled");
			document.getElementById("button_behavior_preempt").style.color = "gray";
		}
	}

	this.syncMirrorClicked = function() {
		if (!RC.Controller.isConnected()) return;

		force_redraw = true; // Request sync and require redraw on behavior update
		RC.PubSub.sendSyncRequest();
		pending_outcome_requests.clear();
		outcome_request.outcome = undefined;
		outcome_request.target = undefined;
		UI.RuntimeControl.displayBehaviorFeedback(4, "Requesting behavior sync...");
	}

	this.displaySyncExtension = function() {
		document.getElementById("sync_bar").style.marginBottom = "0";
		document.getElementById("sync_extension").style.display = "block";
		RC.Sync.setVisualizationCallback(function (sync_processes) {
			let processes = sync_processes.clone();
			if (processes.length == 0) {
				document.getElementById("sync_extension").innerHTML = '<div id="sync_empty" style="font-style: italic; color: gray;"> none active</div>';
				return;
			} else {
				let empt = document.getElementById("sync_empty");
				if (empt != undefined) document.getElementById("sync_extension").removeChild(empt);
			}
			let extension_divs = document.getElementById("sync_extension").childNodes;
			for (let i = 0; i < extension_divs.length; i++) {
				let d = extension_divs[i];
				let p = processes.findElement(function (el) {
					return el.key == d.getAttribute("key") && d.getAttribute("removing") == "false";
				});
				if (p == undefined) {
					if (d.getAttribute("removing") == "false") {
						d.setAttribute('removing', 'true');
						d.childNodes[1].style.color = 'gray';
						d.firstChild.firstChild.style.width = '100%';
						let success = d.firstChild.firstChild.style.backgroundColor == 'rgb(153, 221, 85)';
						d.firstChild.firstChild.style.opacity = '0.4';
						d.childNodes[1].innerText += success? ' - done!' : ' - failed!';
						let remove = function(el, timeout) {
							setTimeout(function() {
								document.getElementById("sync_extension").removeChild(el);
								document.getElementById("sync_extension").style.height =
									Math.max(20, 20 * document.getElementById("sync_extension").childNodes.length) + "px";
							}, timeout);
						}
						remove(d, success? 2500 : 5000);
					}
					continue;
				}
				processes.remove(p);
				let color = (p.status == RC.Sync.STATUS_WARN)? '#dd2' :
							(p.status == RC.Sync.STATUS_ERROR)? '#c64' :
							'#9d5';
				d.firstChild.firstChild.style.backgroundColor = color;
				d.firstChild.firstChild.style.width = (p.fulfilled * 100) + '%';
				d.childNodes[1].innerText = p.key;
			}
			for (let i = 0; i < processes.length; i++) {
				let p = processes[i];
				let d = document.createElement("div");
				d.setAttribute('class', 'sync_entry');
				d.setAttribute('key', p.key);
				d.setAttribute('removing', 'false');
				d_content  = '<div class="sync_bar_border">';
				d_content += '<div class="sync_bar_content" style="width: ' + (p.fulfilled * 100) + '%; background-color: ' + color + ';"></div>';
				d_content += '</div><font>' + p.key + '</font>';
				d.innerHTML = d_content;
				document.getElementById("sync_extension").appendChild(d);
			}
			document.getElementById("sync_extension").style.height = Math.max(20, 20 * document.getElementById("sync_extension").childNodes.length) + "px";
		});
	}

	this.hideSyncExtension = function() {
		document.getElementById("sync_bar").style.marginBottom = "10px";
		document.getElementById("sync_extension").style.display = "none";
		RC.Sync.setVisualizationCallback(undefined);
	}

	this.toggleSyncExtension = function() {
		if (sync_ext_toggle) that.hideSyncExtension();
		else that.displaySyncExtension();
		sync_ext_toggle = !sync_ext_toggle;
	}

	this.displayBehaviorConfiguration = function() {
		that.hideDisplays();
		document.getElementById("runtime_configuration_display").style.display = "inline";
		that.createParameterTable();
	}

	this.displayWaitingForBehavior = function() {
		that.hideDisplays();
		document.getElementById("runtime_waiting_display").style.display = "inline";
	}

	this.displayExternalBehavior = function() {
		that.hideDisplays();
		document.getElementById("runtime_external_display").style.display = "inline";
	}

	this.displayEngineOffline = function() {
		that.hideDisplays();
		document.getElementById("runtime_offline_display").style.display = "inline";
	}

	this.displayNoBehavior = function() {
		that.hideDisplays();
		document.getElementById("runtime_no_behavior_display").style.display = "inline";
		let updateHistoryDisplay = function() {
			let historyHTML = "";
			let currentIdx = ActivityTracer.getCurrentIndex();
			ActivityTracer.getActivityList().forEach((activity, idx) => {
				if (activity == undefined) return;
				let fontStyle = "";
				if (idx > currentIdx) {
					fontStyle = ' style="text-decoration: line-through;"';
				}
				historyHTML += "<li" + fontStyle + ">" + activity.description + "</li>";
			});
			document.getElementById("rc_save_history").innerHTML = "<ul>" + historyHTML + "</ul>";
		};
		updateHistoryDisplay();
		ActivityTracer.setUpdateCallback(updateHistoryDisplay);
	}

	this.updateCurrentState = function(targetHash) {
		const targetId = targetHash & 0xFFFFFF00; // Hash defined in flexbe_core/core/state_map.py
		let output   = targetHash & 0x000000FF;   // Mask the output

		const targetEntry  = Behavior.getStateMap().get(targetId);
		if (targetEntry == undefined) {
			console.log(`\x1b[93mCannot find '${targetId}' (${output}) in `
						+ `state map with ${Behavior.getStateMap().size} entries\x1b[0m`);
			return;
		}
		const targetPath = targetEntry.path;
		const exitUpdate = output == 255;
		if (exitUpdate) {
			output = 0;
		}

		if (force_redraw) {
			RC.Controller.setCurrentStatePath(targetPath);
			return;
		} else if (outcome_request.target != undefined) {

			if (exitUpdate) {
				for (const [key, value] of Array.from(pending_outcome_requests.entries())) {
					const stateEntry = Behavior.getStateMap().get(key);
					if (stateEntry == undefined) {
						console.log(`\xb1[93m Cannot find ${key} in state map with ${Behavior.getStateMap().size} entries.\x1b[0m`);
					}
					const path = stateEntry.path;
					if (path.startsWith(targetPath)) {
						// console.log(`  remove pending outcome '${path}' (${key}) request from inside container '${targetPath}'`);
						pending_outcome_requests.delete(key);
					}
				}
				if (outcome_request.target.startsWith(targetPath)) {
					// Exit update from the container of this request
					if (outcome_request.target === targetPath) {
						// wait for transition confirmation
						// should only occur in a race between transition feedback and outcome messages
						console.log(`  container return '${targetPath}' matches outcome request '${outcome_request.target}' - wait for transition confirmation!`);
						return;
					} else {
						console.log(`  container return '${targetPath}' preempted outcome request '${outcome_request.target}' - clear request!`);
						if (RC.Sync.hasProcess("Transition")) RC.Sync.remove("Transition");
						if (R != undefined) {
							that.drawStatusLabel("");
							that.updateDrawing();
						}
						outcome_request.target = undefined;
						outcome_request.outcome = undefined;
						RC.Controller.updateCurrentStatePath(targetPath); // update if cleared the prior request
					}
				}
			}
			return; // not updating curent state path if pending outcome request
		}
		RC.Controller.updateCurrentStatePath(targetPath);
	}

	this.displayOutcomeRequest = function(outcome, targetState) {

		if (targetState == undefined) {
			// clear all prior outcome requests on start up
			pending_outcome_requests.clear();
			RC.Sync.remove("Transition");
			outcome_request.target = undefined;
			outcome_request.outcome = undefined;
			if (R != undefined) {
				that.drawStatusLabel("");
				that.updateDrawing();
			}
			return;
		}

		const targetPath = targetState.getStatePath();
		const targetId = targetState.getStateId();

		if (outcome == 255) {
			if (pending_outcome_requests.has(targetState.getStateId())) {
				if (outcome_request.target === targetPath) {
					// clear prior request
					if (R != undefined) {
						that.drawStatusLabel("");
						that.updateDrawing();
					}
					outcome_request.target = undefined;
					outcome_request.outcome = undefined;
				}
				pending_outcome_requests.delete(targetId);
			}
		} else {
			for (const [key, value] of Array.from(pending_outcome_requests.entries())) {
				// Check if this outcome request is from a container that has other pending requests
				if (Behavior.getStateMap().has(key)) {
					const path = Behavior.getStateMap().get(key).path;
					if (path.startsWith(targetPath)) {
						// clear prior request from sub state within this container that now has priority
						if (outcome_request.target === path) {
							if (R != undefined) {
								that.drawStatusLabel("");
								that.updateDrawing();
							}
							outcome_request.target = undefined;
							outcome_request.outcome = undefined;
						}
						console.log(`  remove pending outcome '${path}' (${key}) given container '${targetPath}' outcome request '${outcome}'`);
						pending_outcome_requests.delete(key);
					}
				} else {
					console.log(`\x1b[93mdisplayOutcomeRequest: Invalid key '${key}' is not in state map with ${Behavior.getStateMap().size} entries.\x1b[0m`);
				}
			}
			pending_outcome_requests.set(targetId, outcome);
		}

		if (outcome_request.target != undefined) {
			// There is already a pending request
			return;
		}

		setTimeout(that.processNextOutcomeRequest(), 0);
	}

	this.transitionFeedback = function(args) {
		const transitionId = parseInt(args[1]);
		const stateEntry = Behavior.getStateMap().get(transitionId);
		if (stateEntry == undefined) {
			console.log(`\x1b[91m Failed to find matching state for ${transitionId}\x1b[0m`);
			return;
		}
		for (const [key, value] of pending_outcome_requests.entries()) {
			if (key === transitionId) {
				// full path match
				if (value < 0) {
					// request was already dispatched, so this is confirmation
					pending_outcome_requests.delete(key); // we are done with this request
				}
				break;
			}
		}

		RC.Sync.remove("Transition");
		setTimeout(that.processNextOutcomeRequest(), 0); // post callback to process next pending outcome request
	}

	this.processNextOutcomeRequest = function() {
		let nextRequest = null;
		if (pending_outcome_requests.size === 0) return;

		for (const [key, value] of pending_outcome_requests.entries()) {
			const entry = Behavior.getStateMap().get(key);
			const path = entry.path;
			const target_state = entry.state;
			if (value !== 255 && value >= 0) {
				nextRequest = key;
				outcome_request.target = path;
				outcome_request.outcome = target_state.getOutcomes()[value];
				pending_outcome_requests.set(key, -1 - value); // negate and subtract -1 (for 0) to show we have sent the request
				break; // Exit the loop once the first non-255 value is found
			}
		}

		if (nextRequest == null) {
			// No pending outcome requests
			return;
		}

		// Force immediate redraw to avoid issues with prior updates
		current_state = undefined; // force full update
		RC.Controller.setCurrentStatePath(outcome_request.target);
		if (R != undefined) {
			that.drawStatusLabel(`Onboard requested outcome: ${RC.Controller.getCurrentState().getStateName()} > ${outcome_request.outcome}`);
			that.updateDrawing();
		}
	}

	this.displayLockBehavior = function() {
		let lock_button = document.getElementById("button_behavior_lock");
		lock_button.setAttribute("value", "Lock Behavior");

		let selection_box = document.createElement("select");
		selection_box.setAttribute("id", "selection_rc_lock_layer");
		if (R == undefined) {
			lock_button.setAttribute("disabled", "disabled");
			selection_box.innerHTML = '<option>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</option>';
			selection_box.setAttribute("disabled", "disabled");
		} else {
			lock_button.removeAttribute("disabled");
			// collect containers but skip top-level container (behavior)
			let options = [];
			for(let i=current_states.length-1; i>0; i--) {
				if (current_states[i] == undefined) {
					// Skipping undefined current_state
					continue;
				}
				let option = document.createElement("option");
				if (i == current_level) {
					option.setAttribute("selected", "selected");
				}
				try {
					if (current_states[i] instanceof Statemachine && current_states[i].isConcurrent()) {
						options = [];
						option.setAttribute("selected", "selected");
					}
					option.setAttribute("path", current_states[i].getStatePath());
					let txt = current_states[i].getStateName();
					option.setAttribute("title", txt);
					option.text = ((txt.length > 18)? txt.slice(0,15) + "..." : txt);
					options.push(option);
				} catch (err) {
					console.log("\x1b[31m===================================\n===================================");
					console.log("Caught error in displayLockBehavior: " + err);
					console.log("currents : " + current_states.length + " : " + current_states.map(obj => obj && obj.getStateName ? obj.getStateName() : "undefined").join(", "));
					console.log("===================================\x1b[0m");
				}
			}
			options.forEach(function(option) {
				selection_box.add(option);
			});
		}

		let label_td = document.createElement("td");
		label_td.innerHTML = "At level: ";
		let selection_td = document.createElement("td");
		selection_td.appendChild(selection_box);

		let tr = document.getElementById("behavior_lock_display");
		tr.innerHTML = "";
		tr.appendChild(label_td);
		tr.appendChild(selection_td);
	}
	this.displayUnlockBehavior = function(have_changes) {
		let lock_button = document.getElementById("button_behavior_lock");
		lock_button.setAttribute("value", (have_changes)? "Go for it!" : "Unlock Behavior");
		lock_button.removeAttribute("disabled");

		let label_td = document.createElement("td");
		if (have_changes) {
			label_td.innerHTML = '<font style="color: gray">Do further changes or switch to the new version and continue its execution.</font>';
		} else {
			label_td.innerHTML = '<font style="color: gray">You may now change the behavior or unlock it to continue its execution.</font>';
		}

		let tr = document.getElementById("behavior_lock_display");
		tr.innerHTML = "";
		tr.appendChild(label_td);
	}
	this.displayBehaviorChanged = function() {
		let lock_button = document.getElementById("button_behavior_lock");
		lock_button.setAttribute("value", "Unlock Behavior");
		lock_button.setAttribute("disabled", "disabled");

		let button = document.createElement("input");
		button.setAttribute("id", "selection_rc_lock_layer");
		button.setAttribute("type", "button");
		button.setAttribute("value", "Reset Changes");
		button.setAttribute("style", "color: red; width: 70px; white-space: normal;");
		button.addEventListener("click", function() {
			ActivityTracer.resetToExecution();
			if (ActivityTracer.getLastSaveIndex() != ActivityTracer.getExecutionIndex()) {
				IO.BehaviorSaver.saveStateMachine();
				ActivityTracer.addSave();
			}
			RC.Controller.signalReset();
		});

		let label_td = document.createElement("td");
		label_td.innerHTML = '<font style="color: gray">Behavior changed, please save before unlock.</font>';
		let button_td = document.createElement("td");
		button_td.appendChild(button);

		let tr = document.getElementById("behavior_lock_display");
		tr.innerHTML = "";
		tr.appendChild(label_td);
		tr.appendChild(button_td);
	}

	this.displayState = function(state_path) {
		if (R == undefined) that.initializeStateDisplay();

		if (state_path == "") {
			that.resetStateDisplay();
			return;
		}

		// always update current states when state path updated
		let path_segments = state_path.split("/");
		let path_recreate = "";
		for (let i=1; i<path_segments.length; i++) {
			path_recreate += "/" + path_segments[i];
			let new_current_state = Behavior.getStatemachine().getStateByPath(path_recreate);
			if (new_current_state != current_states[i]) {
				previous_states[i] = current_states[i];
			}
			current_states[i] = new_current_state;
		}
		current_states = current_states.slice(0, path_segments.length);

		if (!force_redraw) {
			try {
				if (current_state != undefined && current_level < path_segments.length
					&& current_states[current_level] != undefined
					&& current_states[current_level].getStatePath() == current_state.getStatePath()) {
					// don't update display if it's only a child update
					if (!RC.Controller.isLocked()) {
						that.displayLockBehavior();
					}
					return;
				}
			} catch (err) {
				console.log("\x1b[91m==============================");
				console.log("===============================");
				console.log("Caught Error in displayState: " + err);
				console.log(current_level);
				console.log("path : " + path_segments.length + " : '" + path_segments + "'");
				console.log(JSON.stringify(current_state));
				console.log("currents : " + current_states.length + " : " + current_states.map(obj => obj && obj.state_name ? obj.state_name : "undefined").join(", "));
				console.log("previous : " + previous_states.length + " : " + previous_states.map(obj => obj && obj.state_name ? obj.state_name : "undefined").join(", "));
				console.log("===============================\x1b[0m");
			}
		}
		current_level = path_segments.length - 1;
		if (current_level < 0) {
			console.log("\x1b[36muiRuntimeControl:displayState : current level < 0!\x1b[0m");
			current_level = 0;
		}
		if (!RC.Controller.isLocked()) {
			that.displayLockBehavior();
		}

		if (status_label != undefined) {
			if (!status_label.attr('text').includes(path_segments[current_level])){
				// Preserve existing status label if it includes text from the deepest state
				status_label.remove();
				status_label = undefined;
			}
		}

		that.updateStateDisplay();
	}

	this.displayBehaviorFeedback = function(level, text) {
		let color = "black";
		let collapse = UI.Settings.isCollapseInfo();
		switch(level) {
			case 1:
				color = "orange";
				collapse = UI.Settings.isCollapseWarn();
				break;
			case 2:
				color = "navy";
				collapse = UI.Settings.isCollapseHint();
				break;
			case 3:
				color = "red";
				collapse = UI.Settings.isCollapseError();
				break;
			case 4:
				color = "green";
				collapse = false;
				break;
		}
		let currentdate = new Date();
		let time = currentdate.toLocaleTimeString();

		let text_split = text.split("\n");
		let text_title = text_split[0];
		let text_body = "";
		for (let i = 1; i < text_split.length; i++) {
			text_body += "<br />&nbsp;&nbsp;&nbsp;&nbsp;";
			text_body += text_split[i].replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
		}

		let panel = document.getElementById("runtime_feedback_text");

		let entry_time = document.createElement("span");
		entry_time.style.color = "gray";
		entry_time.innerHTML = "[" + time + "] ";

		let entry_title = document.createElement("span"); // changed from deprecated "font"
		entry_title.style.color = color;
		entry_title.style.fontWeight = level == 2 ? "bold" : "";
		entry_title.style.fontSize = "9pt";
		entry_title.innerHTML = text_title;

		let entry_body = undefined;
		let entry_toggle = undefined;
		if (text_body != "") {
			entry_body = document.createElement("span");
			entry_body.style.color = color;
			entry_body.style.opacity = "0.8";
			entry_body.innerHTML = text_body;
			entry_body.style.display = collapse? "none" : "";

			entry_toggle = document.createElement("span");
			entry_toggle.style.cursor = "pointer";
			entry_toggle.innerHTML = collapse? " [+]" : " [-]";
			entry_toggle.title = collapse? "show details" : "hide details";
			entry_toggle.addEventListener("click", function() {
				if (entry_toggle.innerHTML == " [-]") {
					entry_toggle.innerHTML = " [+]";
					entry_toggle.title = "show details";
					entry_body.style.display = "none";
				} else {
					entry_toggle.innerHTML = " [-]";
					entry_body.style.display = "";
					entry_toggle.title = "hide details";
					panel.scrollTop = entry_title.offsetTop - panel.offsetTop;
				}
			});
		}

		let entry = document.createElement("div");
		entry.style.whiteSpace = "nowrap";
		entry.appendChild(entry_time);
		entry.appendChild(entry_title);
		if (entry_body != undefined) {
			entry.appendChild(entry_toggle);
			entry.appendChild(entry_body);
		}

		let prev_entry = panel.lastChild
		if (prev_entry != undefined) {
			prev_entry.children[1].style.fontSize = "";
		}
		panel.appendChild(entry);

		panel.scrollTop = entry_title.offsetTop - panel.offsetTop;
	}

	var helper_collectEmbeddedBehaviors = function(sm) {
		if (sm == undefined) return;
		let states = sm.getStates();
		let result = [];
		for (let i = 0; i < states.length; i++) {
			if (states[i] instanceof Statemachine) {
				result = result.concat(helper_collectEmbeddedBehaviors(states[i]));
			}
			if (states[i] instanceof BehaviorState) {
				result.push(states[i]);
				result = result.concat(helper_collectEmbeddedBehaviors(states[i].getBehaviorStatemachine()));
			}
		}
		return result;
	}

	this.setupTabHandling = function() {
		// Set focus on the main panel to capture key presses
		document.getElementById("runtimecontrol").focus({preventScroll: true});
		tab_targets = updateTabTargets("runtimecontrol");
		// We do not set intial focus on runtime
	}

	this.removeTabHandling = function() {
		tab_targets.length = 0;
	}

	var updateTabTargets = function(panel_id) {
		let select_tags = 'input, select, button';

		let panel = document.getElementById(panel_id);
		let targets = Array.from(panel.querySelectorAll(select_tags));
		targets = targets.filter(function(el) {
			if (el.tabIndex === -1)  return false;
			if (el.id == '') return false;
			let parentDiv = el.parentElement;
			while (parentDiv) {
				if (parentDiv.id == panel.id) {
					return true;
				}
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
		if (event.key === "Tab") {
			// RC is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			if (tab_targets.length == 0) return;
			let match = undefined;
			let match_ndx = -1;
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
				let new_match_ndx = -1;
				let new_match = undefined;
				let try_match_ndx = match_ndx;
				while (new_match != document.activeElement && new_match_ndx != match_ndx) {
					// Handle hidden element (e.g. synthesis block on statemachine panel)
					new_match_ndx = event.shiftKey
										? (try_match_ndx - 1 + tab_targets.length) % tab_targets.length
										: (try_match_ndx + 1) % tab_targets.length;
					new_match = tab_targets[new_match_ndx];
					new_match.focus({ preventScroll: true });
					try_match_ndx = new_match_ndx; // Continue to look for next valid target
				}
			} else {
				// console.log(`Activate initial tab focus in runtimecontrol!`);
				tab_targets[0].focus({ preventScroll: true }); // Move focus to the first input
			}
		} else if (event.target.id === 'runtimecontrol') {
			// RC is active so capture all keys
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
	}

	this.handleKeyUp = function(event) {
		if (event.key === "Tab") {
			// Panel is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		} else if (event.target.id === 'runtimecontrol') {
			// RC is active so capture all keys require click confirmation
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
	}

}) ();