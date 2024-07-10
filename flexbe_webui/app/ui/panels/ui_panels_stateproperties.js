UI.Panels.StateProperties = new (function() {
	var that = this;

	var current_prop_state;
	var apply_pulse = undefined;

	var fadeOutBackground = function(id) {
	 	document.getElementById(id).style.transition = "all 1s ease-out";
		document.getElementById(id).style.background = "";
	}

	var addHoverDocumentation = function(el, type, name, state_class, behavior_name) {
		if (state_class) {
			var def = WS.Statelib.getFromLib(state_class);
		} else if (behavior_name) {
			var def = WS.Behaviorlib.getByName(behavior_name);
		}
		var doc = undefined;
		switch (type) {
			case "param": doc = def.getParamDesc().findElement(function(el) { return el.name == name; }); break;
			case "input": doc = def.getInputDesc().findElement(function(el) { return el.name == name; }); break;
			case "output": doc = def.getOutputDesc().findElement(function(el) { return el.name == name; }); break;
			case "outcome": doc = def.getOutcomeDesc().findElement(function(el) { return el.name == name; }); break;
		}
		if (doc == undefined) return;

		el.addEventListener('mouseover', function() {
			var rect = this.getBoundingClientRect();
			var tt = document.createElement("div");
			tt.setAttribute("style", "right: 370px; top: " + rect.top + "px; display: block;");
			tt.setAttribute("class", "sidepanel_tooltip");
			tt.setAttribute("id", "properties_tooltip");
			tt.innerHTML = "";
			if (type != "outcome") {
				tt.innerHTML += "<div style='margin-bottom: 0.5em;'>Type: <i>" + doc.type + "</i></div>";
			}
			tt.innerHTML += doc.desc;
			document.getElementsByTagName("body")[0].appendChild(tt);
		});
		el.addEventListener('mouseout', removeHover);
	}

	var removeHover = function() {
		var tt = document.getElementById("properties_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}
	}

	var addAutocomplete = function(el, state_type, mode, state, additional_keywords) {
		var additional_keywords = additional_keywords || [];
		if (state_type != undefined) {
			var state_def = WS.Statelib.getFromLib(state_type);
			var state_prefix = (!UI.Settings.isExplicitStates() && WS.Statelib.isClassUnique(state_def.getStateClass()))?
				state_def.getStateClass() : state_def.getStatePackage() + "__" + state_def.getStateClass();
			var class_vars = state_def.getClassVariables();
			for (var i = 0; i < class_vars.length; i++) {
				var class_var = class_vars[i];
				additional_keywords.push({text: class_var, hint: "", fill: state_prefix + "." + class_var});
			}
			additional_keywords.push({text: state_def.getStateClass(), hint: "", fill: state_prefix + "."});
		}

		el.addEventListener('keyup', function(evt) {
			var ac = document.getElementById("properties_autocomplete");
			var suggestions = (mode == "input")? Autocomplete.generateInputUserdata(this.value, state) :
							  (mode == "output")? Autocomplete.generateOutputUserdata(this.value, state) :
							  	Autocomplete.generateList(this.value, additional_keywords, state);

			if (suggestions.length == 0) {
				ac.setAttribute("style", "display: none;");
				return;
			}
			var idx = parseInt(ac.getAttribute("idx"));
			if (idx != -1 && (evt.keyCode == 13)) {
				this.value = suggestions[idx].fill;
				ac.setAttribute("style", "display: none;");
				return;
			}
			if (evt.keyCode == 40) { idx = Math.min(idx + 1, Math.min(suggestions.length - 1, 9)); ac.setAttribute("idx", idx); }
			else if (evt.keyCode == 38) { idx = Math.max(idx - 1, 0); ac.setAttribute("idx", idx); }
			else { ac.setAttribute("idx", "0"); }
			var rect = this.getBoundingClientRect();
			ac.setAttribute("style", "width: " + (rect.width-5) + "px; left: " + (rect.left) + "px; top: " + (rect.top + rect.height) + "px; display: block;");
			ac.innerHTML = "";
			for (var i = 0; i < Math.min(suggestions.length, 10); i++) {
				var s = suggestions[i];
				var chars = s.text.length + s.hint.length;
				var hint = (chars < 30)? s.hint : s.hint.substring(0,25-s.text.length) + "...";
				var div = document.createElement("div");
				div.style.backgroundColor = (i==idx)? "#def": "";
				div.style.padding = "2px";
				div.setAttribute("title", s.hint);
				div.setAttribute("fill", s.fill);
				div.addEventListener('click', function() {
					el.value = this.getAttribute("fill");
					ac.setAttribute("style", "display: none;");
				});
				div.innerHTML = "<span style='float:right; color:grey;'>" + hint + "</span>" + s.text;
				ac.appendChild(div);
			};
			this.setSelectionRange(this.value.length, this.value.length);
		});
		el.addEventListener('blur', function() {
			setTimeout(function() {
				var ac = document.getElementById("properties_autocomplete");
				ac.setAttribute("style", "display: none;");
				ac.setAttribute("idx", "0");
			}, 200);
		});
	}

	var displayPropertiesForState = function(state) {
		document.getElementById("panel_properties_state").style.display = "block";
		document.getElementById("panel_properties_behavior").style.display = "none";
		document.getElementById("panel_properties_statemachine").style.display = "none";

		document.getElementById("input_prop_state_name").value = state.getStateName();
		document.getElementById("label_prop_state_class").innerText = state.getStateClass();
		document.getElementById("label_prop_state_package").innerText = state.getStatePackage();
		document.getElementById("label_prop_state_desc").innerText = WS.Statelib.getFromLib(state.getStateType()).getStateDesc();

		var highlight_apply_button = function() {
			if (apply_pulse != undefined) return;
			apply_button = document.getElementById("button_apply_properties");
			apply_button.style.background = "#fd5";

	 		apply_button.style.transition = "all 0.25s ease-in";
	 		is_on = false;

	 		var border_pulse = function() {
	 			if (is_on) {
	 				apply_button.style.background = "black";
	 				apply_button.style.color = "white";
	 			} else {
	 				apply_button.style.background = "white";
	 				apply_button.style.color = "black";
	 			}
	 			apply_pulse = setTimeout(border_pulse, is_on? 300 : 700);
	 			is_on = !is_on;
			}
			border_pulse();
		}

		params = state.getParameters();
		values = state.getParameterValues();
		if (params.length > 0) {
			document.getElementById("panel_prop_parameters").style.display = "block";
			document.getElementById("panel_prop_parameters_content").innerHTML = "";
			for (var i=0; i<params.length; ++i) {
				var tr = document.createElement("tr");
				var td_label = document.createElement("td");
				td_label.innerText =  params[i] + ": ";
				var td_input = document.createElement("td");
				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", values[i]);
				input_field.setAttribute("title", VarSolver.resolveAsList(values[i]).join(", "));
				input_field.style.backgroundColor = Checking.setColorByEntryType(values[i]);
				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_parameters_content").appendChild(tr);

				addHoverDocumentation(tr, "param", params[i], state.getStateType());

				addAutocomplete(input_field, state.getStateType(), undefined, state);

				input_field.addEventListener('blur', function() {
					this.style.backgroundColor = Checking.setColorByEntryType(this.value);
				});
				input_field.addEventListener('change', function() {
					highlight_apply_button();
				});
			}
		} else {
			document.getElementById("panel_prop_parameters").style.display = "none";
		}

		var outcome_list_complete = state.getOutcomes();
		var autonomy_list_complete = state.getAutonomy();
		if (outcome_list_complete.length > 0) {
			document.getElementById("panel_prop_autonomy").style.display = "block";
			document.getElementById("panel_prop_autonomy_content").innerHTML = "";
			for (var i=0; i<outcome_list_complete.length; ++i) {
				var tr = document.createElement("tr");
				tr.innerHTML = "<td>" + outcome_list_complete[i] + ": </td>"
					+"<td><select class='select_box'>"
					+"<option value='0' " + ((autonomy_list_complete[i] == 0)? "selected='selected'" : "") + " style='color: black;'>Off</option>"
					+"<option value='1' " + ((autonomy_list_complete[i] == 1)? "selected='selected'" : "") + " style='color: blue;'>Low</option>"
					+"<option value='2' " + ((autonomy_list_complete[i] == 2)? "selected='selected'" : "") + " style='color: green;'>High</option>"
					+"<option value='3' " + ((autonomy_list_complete[i] == 3)? "selected='selected'" : "") + " style='color: red;'>Full</option>"
					+"<option value='-1' " + ((autonomy_list_complete[i] == -1)? "selected='selected'" : "") + " style='color: gray; font-style: italic;'>Inherit</option>"
					+"</select></td>";
				document.getElementById("panel_prop_autonomy_content").appendChild(tr);
				addHoverDocumentation(tr, "outcome", outcome_list_complete[i], state.getStateType());
			}
		} else {
			document.getElementById("panel_prop_autonomy").style.display = "none";
		}

		input_keys = state.getInputKeys();
		input_mapping = state.getInputMapping();
		if (input_keys.length > 0) {
			document.getElementById("panel_prop_input_keys").style.display = "block";
			document.getElementById("panel_prop_input_keys_content").innerHTML = "";
			for (var i=0; i<input_keys.length; ++i) {
				console.log(`\x1b[96m Adding input key block for '${input_keys[i]}'\x1b[0m`);
				var tr = document.createElement("tr");
				var td_label = document.createElement("td");
				td_label.innerText =  input_keys[i] + ": ";
				var td_input = document.createElement("td");
				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", input_mapping[i]);
				input_field.addEventListener('change', function() {
					highlight_apply_button();
				});

				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_input_keys_content").appendChild(tr);

				addHoverDocumentation(tr, "input", input_keys[i], state.getStateType());

				addAutocomplete(input_field, state.getStateType(), "input", state);
			}
		} else {
			document.getElementById("panel_prop_input_keys").style.display = "none";
			document.getElementById("panel_prop_input_keys_content").innerHTML = "";
		}

		output_keys = state.getOutputKeys();
		output_mapping = state.getOutputMapping();
		if (output_keys.length > 0) {
			document.getElementById("panel_prop_output_keys").style.display = "block";
			document.getElementById("panel_prop_output_keys_content").innerHTML = "";
			for (var i=0; i<output_keys.length; ++i) {
				var tr = document.createElement("tr");
				var td_label = document.createElement("td");
				td_label.innerText =  output_keys[i] + ": ";
				var td_input = document.createElement("td");
				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", output_mapping[i]);
				input_field.addEventListener('change', function() {
					highlight_apply_button();
				});

				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_output_keys_content").appendChild(tr);

				addHoverDocumentation(tr, "output", output_keys[i], state.getStateType());

				addAutocomplete(input_field, state.getStateType(), "output", state);
			}
		} else {
			document.getElementById("panel_prop_output_keys").style.display = "none";
			document.getElementById("panel_prop_output_keys_content").innerHTML = "";
		}
	}

	var displayPropertiesForStatemachine = function(state) {
		document.getElementById("panel_properties_state").style.display = "none";
		document.getElementById("panel_properties_behavior").style.display = "none";
		document.getElementById("panel_properties_statemachine").style.display = "block";

		document.getElementById("input_prop_sm_name").value = state.getStateName();

		if (state.isConcurrent()) {
			document.getElementById("select_container_type").value = "concurrency";
			document.getElementById("doc_container_type").innerHTML = "Parallel execution of all elements.";
		} else if (state.isPriority()) {
			document.getElementById("select_container_type").value = "priority";
			document.getElementById("doc_container_type").innerHTML = "Execution supersedes all other containers.";
		} else {
			document.getElementById("select_container_type").value = "statemachine";
			document.getElementById("doc_container_type").innerHTML = "Sequential execution based on outcomes.";
		}

		// Outcomes
		//----------
		document.getElementById("panel_prop_sm_outcomes_content").innerHTML = "";
		for (var i=0; i<state.getOutcomes().length; ++i) {
			var label = document.createElement("td");
			label.innerHTML = state.getOutcomes()[i] + ": ";

			var input_field = document.createElement("td");
			input_field.innerHTML = "<select class='select_box'>"
				+"<option value='-1' " + ((state.getAutonomy()[i] == -1)? "selected='selected'" : "") + " style='color: gray; font-style: italic;'>Inherit</option>"
				+"</select>";

			var remove_button = document.createElement("img");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this outcome");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("outcome", state.getOutcomes()[i]);
			remove_button.addEventListener("click", function() {
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				var removed_outcome = this.getAttribute("outcome");
				state.removeOutcome(removed_outcome);
				var row = this.parentNode;
				row.parentNode.removeChild(row);
				UI.Statemachine.refreshView();
				var container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed outcome from container " + current_prop_state.getStateName(),
					function() { // undo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.addOutcome(removed_outcome);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.removeOutcome(removed_outcome);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});

			var row = document.createElement("tr");
			row.appendChild(label);
			row.appendChild(input_field);
			row.appendChild(remove_button);
			document.getElementById("panel_prop_sm_outcomes_content").appendChild(row);
		}

		// Input Keys
		//------------
		input_keys = state.getInputKeys();
		input_mapping = state.getInputMapping();
		document.getElementById("panel_prop_sm_input_keys_content").innerHTML = "";
		for (var i=0; i<input_keys.length; ++i) {
			var label = document.createElement("td");
			label.innerHTML = input_keys[i] + ": ";

			var input_field = document.createElement("input");
			input_field.setAttribute("class", "inline_text_edit");
			input_field.setAttribute("type", "text");
			input_field.setAttribute("value", input_mapping[i]);
			input_field.setAttribute("input_key", input_keys[i]);
			input_field.addEventListener("blur", function() {
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				var input_key = this.getAttribute("input_key");
				var idx = state.getInputKeys().indexOf(input_key);
				var old_mapping_value = state.getInputMapping()[idx];
				var new_mapping_value = this.value
				state.getInputMapping()[idx] = new_mapping_value;
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				var container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Changed input mapping of container " + current_prop_state.getStateName(),
					function() { // undo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						var idx = state.getInputKeys().indexOf(input_key);
						container.getInputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						var idx = state.getInputKeys().indexOf(input_key);
						container.getInputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});
			var input_field_td = document.createElement("td");
			input_field_td.appendChild(input_field);
			addAutocomplete(input_field, undefined, "input", state);

			var remove_button = document.createElement("img");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this input key");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("input_key", input_keys[i]);
			remove_button.addEventListener("click", function() {
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				var idx = state.getInputKeys().indexOf(this.getAttribute("input_key"));
				var old_input_key = this.getAttribute("input_key");
				var old_input_mapping = state.getInputMapping()[idx];
				state.getInputKeys().remove(old_input_key);
				state.getInputMapping().remove(old_input_mapping);
				var row = this.parentNode;
				row.parentNode.removeChild(row);
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				var container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed input key of container " + current_prop_state.getStateName(),
					function() { // undo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getInputKeys().push(old_input_key);
						container.getInputMapping().push(old_input_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getInputKeys().remove(old_input_key);
						container.getInputMapping().remove(old_input_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});

			var row = document.createElement("tr");
			row.appendChild(label);
			row.appendChild(input_field_td);
			row.appendChild(remove_button);
			document.getElementById("panel_prop_sm_input_keys_content").appendChild(row);
		}

		// Output Keys
		//-------------
		output_keys = state.getOutputKeys();
		output_mapping = state.getOutputMapping();
		document.getElementById("panel_prop_sm_output_keys_content").innerHTML = "";
		for (var i=0; i<output_keys.length; ++i) {
			var label = document.createElement("td");
			label.innerHTML = output_keys[i] + ": ";

			var input_field = document.createElement("input");
			input_field.setAttribute("class", "inline_text_edit");
			input_field.setAttribute("type", "text");
			input_field.setAttribute("value", output_mapping[i]);
			input_field.setAttribute("output_key", output_keys[i]);
			input_field.addEventListener("blur", function() {
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				var output_key = this.getAttribute("output_key");
				var idx = state.getOutputKeys().indexOf(output_key);
				var old_mapping_value = state.getOutputMapping()[idx];
				var new_mapping_value = this.value
				state.getOutputMapping()[idx] = new_mapping_value;
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				var container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Changed output mapping of container " + current_prop_state.getStateName(),
					function() { // undo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						var idx = state.getOutputKeys().indexOf(output_key);
						container.getOutputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						var idx = state.getOutputKeys().indexOf(output_key);
						container.getOutputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});
			var input_field_td = document.createElement("td");
			input_field_td.appendChild(input_field);
			addAutocomplete(input_field, undefined, "output", state);

			var remove_button = document.createElement("img");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this output key");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("output_key", output_keys[i]);
			remove_button.addEventListener("click", function() {
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				var idx = state.getOutputKeys().indexOf(this.getAttribute("output_key"));
				var old_output_key = this.getAttribute("output_key");
				var old_output_mapping = state.getOutputMapping()[idx];
				state.getOutputKeys().remove(old_output_key);
				state.getOutputMapping().remove(old_output_mapping);
				var row = this.parentNode;
				row.parentNode.removeChild(row);
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				var container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed output key of container " + current_prop_state.getStateName(),
					function() { // undo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getOutputKeys().push(old_output_key);
						container.getOutputMapping().push(old_output_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						var container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getOutputKeys().remove(old_output_key);
						container.getOutputMapping().remove(old_output_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});

			var row = document.createElement("tr");
			row.appendChild(label);
			row.appendChild(input_field_td);
			row.appendChild(remove_button);
			document.getElementById("panel_prop_sm_output_keys_content").appendChild(row);
		}
	}

	var displayPropertiesForBehavior = function(state) {
		var tt = document.getElementById("properties_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}

		document.getElementById("panel_properties_state").style.display = "none";
		document.getElementById("panel_properties_behavior").style.display = "block";
		document.getElementById("panel_properties_statemachine").style.display = "none";

		document.getElementById("input_prop_be_name").value = state.getStateName();
		document.getElementById("label_prop_be_class").innerText = state.getBehaviorName();
		document.getElementById("label_prop_be_package").innerText = state.getStatePackage();
		document.getElementById("label_prop_be_desc").innerText = WS.Behaviorlib.getByName(state.getBehaviorName()).getBehaviorDesc();

		// Parameters
		//-----------
		params = state.getParameters();
		values = state.getParameterValues();
		if (params.length > 0) {
			document.getElementById("panel_prop_be_parameters").style.display = "block";
			document.getElementById("panel_prop_be_parameters_content").innerHTML = "";
			for (var i=0; i<params.length; ++i) {
				var param_def = state.getParameterDefinition(params[i]);
				var default_value = param_def.default;
				default_value = (param_def.type == "text" || param_def.type == "enum")? '"' + default_value + '"' : default_value;
				var label = document.createElement("td");
				label.innerHTML = params[i] + ": ";

				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", values[i] || default_value);
				input_field.setAttribute("default_value", default_value);
				input_field.setAttribute("param_key", params[i]);
				if (values[i] == undefined) {
					input_field.setAttribute("style", "text-decoration: line-through; color: rgba(0,0,0,.4);");
					input_field.setAttribute("disabled", "disabled");
					input_field.setAttribute("title", "Default: " + default_value);
					input_field.setAttribute("class", "inline_text_edit_readonly");
					label.setAttribute("style", "color: gray");
				}
				input_field.addEventListener("blur", function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) {
							this.value = !this.value;
							return;
						}
					var param_key = this.getAttribute("param_key");
					var param_value = this.value;
					var idx = state.getParameters().indexOf(param_key);
					var old_value = state.getParameterValues()[idx];
					state.getParameterValues()[idx] = param_value;
					var behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed parameter value of behavior " + current_prop_state.getStateName(),
						function() { // undo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getParameters().indexOf(param_key);
							behavior_state.getParameterValues()[idx] = old_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						},
						function() { // redo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getParameters().indexOf(param_key);
							behavior_state.getParameterValues()[idx] = param_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						}
					);
				});
				var input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				var additional_keywords = undefined;
				if (param_def.type == "enum") {
					additional_keywords = [];
					param_def.additional.forEach(opt => {
						additional_keywords.push({text: opt, hint: "enum", fill: '"' + opt + '"'});
					});
				}
				addAutocomplete(input_field, undefined, undefined, undefined, additional_keywords);

				var default_button = document.createElement("input");
				default_button.setAttribute("type", "checkbox");
				default_button.setAttribute("param_key", params[i]);
				if (values[i] == undefined) {
					default_button.setAttribute("checked", "checked");
				}
				default_button.addEventListener("change", function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					var input_field = this.parentNode.parentNode.childNodes[1].firstChild;
					var param_key = this.getAttribute("param_key");
					var param_value = input_field.value;
					var behavior_path = current_prop_state.getStatePath();
					var make_default = function() {
						var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						var idx = behavior_state.getParameters().indexOf(param_key);
						behavior_state.getParameterValues()[idx] = undefined;
						if (behavior_state == current_prop_state)
							displayPropertiesForBehavior(current_prop_state);
					}
					var remove_default = function() {
						var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						var idx = behavior_state.getParameters().indexOf(param_key);
						behavior_state.getParameterValues()[idx] = param_value;
						if (behavior_state == current_prop_state)
							displayPropertiesForBehavior(current_prop_state);
					}
					if(this.checked) {
						make_default();
						ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
							"Use default value for parameter " + param_key + " of behavior " + current_prop_state.getStateName(),
							remove_default,
							make_default
						);
					} else {
						remove_default();
						ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
							"Set custom value for parameter " + param_key + " of behavior " + current_prop_state.getStateName(),
							make_default,
							remove_default
						);
					}
					UI.RuntimeControl.resetParameterTableClicked();
				});
				var default_button_txt = document.createElement("label");
				default_button_txt.innerText = "default";
				var default_button_td = document.createElement("td");
				default_button_td.setAttribute("title", "Use the default value as defined by the behavior.");
				default_button_td.appendChild(default_button);
				default_button_td.appendChild(default_button_txt);

				var row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				row.appendChild(default_button_td);
				document.getElementById("panel_prop_be_parameters_content").appendChild(row);

				addHoverDocumentation(row, "param", params[i], undefined, state.getBehaviorName());
			}
		} else {
			document.getElementById("panel_prop_be_parameters").style.display = "none";
		}

		// Outcomes
		//----------
		var outcome_list_complete = state.getOutcomes();
		var autonomy_list_complete = state.getAutonomy();
		if (outcome_list_complete.length > 0) {
			document.getElementById("panel_prop_be_autonomy").style.display = "block";
			document.getElementById("panel_prop_be_autonomy_content").innerHTML = "";
			for (var i=0; i<outcome_list_complete.length; ++i) {
				document.getElementById("panel_prop_be_autonomy_content").innerHTML += "<tr><td>" + outcome_list_complete[i] + ": </td>"
					+"<td><select class='select_box'>"
					+"<option value='-1' " + ((autonomy_list_complete[i] == -1)? "selected='selected'" : "") + " style='color: gray; font-style: italic;'>Inherit</option>"
					+"</select></td></tr>";
			}
		} else {
			document.getElementById("panel_prop_be_autonomy").style.display = "none";
		}

		// Input Keys
		//------------
		input_keys = state.getInputKeys();
		input_mapping = state.getInputMapping();
		if (input_keys.length > 0) {
			document.getElementById("panel_prop_be_input_keys").style.display = "block";
			document.getElementById("panel_prop_be_input_keys_content").innerHTML = "";
			for (var i=0; i<input_keys.length; ++i) {
				var label = document.createElement("td");
				label.innerHTML = input_keys[i] + ": ";

				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", input_mapping[i] || input_keys[i]);
				input_field.setAttribute("input_key", input_keys[i]);
				if (input_mapping[i] == undefined) {
					input_field.setAttribute("style", "text-decoration: line-through; color: rgba(0,0,0,.4);");
					input_field.setAttribute("disabled", "disabled");
					input_field.setAttribute("title", "Value: " + state.getDefaultUserdataValue(input_keys[i]));
					input_field.setAttribute("class", "inline_text_edit_readonly");
					label.setAttribute("style", "color: gray");
				}
				input_field.addEventListener("blur", function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					var input_key = this.getAttribute("input_key");
					var input_value = this.value;
					var idx = state.getInputKeys().indexOf(input_key);
					var old_input_value = state.getInputMapping()[idx];
					state.getInputMapping()[idx] = input_value;
					if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					var behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed input mapping of behavior " + current_prop_state.getStateName(),
						function() { // undo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getInputKeys().indexOf(input_key);
							behavior_state.getInputMapping()[idx] = old_input_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						},
						function() { // redo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getInputKeys().indexOf(input_key);
							behavior_state.getInputMapping()[idx] = input_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						}
					);
				});
				var input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				addAutocomplete(input_field, undefined, "input", state);

				var default_button = document.createElement("input");
				default_button.setAttribute("type", "checkbox");
				default_button.setAttribute("input_key", input_keys[i]);
				if (input_mapping[i] == undefined) {
					default_button.setAttribute("checked", "checked");
				}
				default_button.addEventListener("change", function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					var input_field = this.parentNode.parentNode.childNodes[1].firstChild;
					var input_key = this.getAttribute("input_key");
					var input_value = input_field.value;
					var behavior_path = current_prop_state.getStatePath();
					var make_default = function() {
						var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						var idx = behavior_state.getInputKeys().indexOf(input_key);
						behavior_state.getInputMapping()[idx] = undefined;
						if (behavior_state == current_prop_state)
							displayPropertiesForBehavior(current_prop_state);
						if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					}
					var remove_default = function() {
						var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						var idx = behavior_state.getInputKeys().indexOf(input_key);
						behavior_state.getInputMapping()[idx] = input_value;
						if (behavior_state == current_prop_state)
							displayPropertiesForBehavior(current_prop_state);
						if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					}
					if(this.checked) {
						make_default();
						ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
							"Use default value for input key " + input_key + " of behavior " + current_prop_state.getStateName(),
							remove_default,
							make_default
						);
					} else {
						remove_default();
						ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
							"Set custom value for input key " + input_key + " of behavior " + current_prop_state.getStateName(),
							make_default,
							remove_default
						);
					}
					if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				});
				var default_button_txt = document.createElement("label");
				default_button_txt.innerText = "default";
				var default_button_td = document.createElement("td");
				default_button_td.setAttribute("title", "Use the default value as defined by the behavior.");
				default_button_td.appendChild(default_button);
				default_button_td.appendChild(default_button_txt);

				var row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				row.appendChild(default_button_td);
				document.getElementById("panel_prop_be_input_keys_content").appendChild(row);
			}
		} else {
			document.getElementById("panel_prop_be_input_keys").style.display = "none";
		}

		// Output Keys
		//-------------
		output_keys = state.getOutputKeys();
		output_mapping = state.getOutputMapping();
		if (output_keys.length > 0) {
			document.getElementById("panel_prop_be_output_keys").style.display = "block";
			document.getElementById("panel_prop_be_output_keys_content").innerHTML = "";
			for (var i=0; i<output_keys.length; ++i) {
				var label = document.createElement("td");
				label.innerHTML = output_keys[i] + ": ";

				var input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", output_mapping[i]);
				input_field.setAttribute("output_key", output_keys[i]);
				input_field.addEventListener("blur", function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					var output_key = this.getAttribute("output_key");
					var output_value = this.value;
					var idx = state.getOutputKeys().indexOf(output_key);
					var old_output_value = state.getOutputMapping()[idx];
					state.getOutputMapping()[idx] = output_value;
					if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					var behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed output mapping of behavior " + current_prop_state.getStateName(),
						function() { // undo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getOutputKeys().indexOf(output_key);
							behavior_state.getOutputMapping()[idx] = old_output_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						},
						function() { // redo
							var behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							var idx = behavior_state.getOutputKeys().indexOf(output_key);
							behavior_state.getOutputMapping()[idx] = output_value;
							if (behavior_state == current_prop_state)
								displayPropertiesForBehavior(current_prop_state);
						}
					);
				});
				var input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				addAutocomplete(input_field, undefined, "output", state);

				var row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				document.getElementById("panel_prop_be_output_keys_content").appendChild(row);
			}
		} else {
			document.getElementById("panel_prop_be_output_keys").style.display = "none";
		}
	}


	this.show = function() {
		if (current_prop_state == undefined) {
			T.debugWarn("Current state not set for properties!");
			return;
		}
		UI.Panels.setActivePanel(UI.Panels.STATE_PROPERTIES_PANEL);
		document.activeElement.blur();
		if (apply_pulse != undefined) clearTimeout(apply_pulse);
		document.getElementById('button_apply_properties').style.background = "";
		document.getElementById('button_apply_properties').style.color = "";
	}

	this.hide = function() {
		removeHover();
		UI.Panels.hidePanelIfActive(UI.Panels.STATE_PROPERTIES_PANEL);
		current_prop_state = undefined;
		document.activeElement.blur();
		if (apply_pulse != undefined) clearTimeout(apply_pulse);
		document.getElementById('button_apply_properties').style.background = "";
		document.getElementById('button_apply_properties').style.color = "";
	}

	this.closePropertiesClicked = function() {
		that.hide();
	}

	this.deleteStateClicked = function() {
		removeHover();
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) {

			var id = "";
			if (current_prop_state instanceof Statemachine) { id = "button_delete_sm"; }
			if (current_prop_state instanceof BehaviorState) { id = "button_delete_be"; }
			else { id = "button_delete_state"; }
			document.getElementById(id).style.transition = "none";
			document.getElementById(id).style.background = "#f63";
			window.setTimeout(function() { fadeOutBackground(id); }, 100);
			return;
		}

		var userChoice = confirm(`Confirm deletion of '${current_prop_state.getStateName()}'`);
		if (!userChoice) {
			console.log(`\x1b[93mIgnore request to delete '${current_prop_state.getStateName()}'`);
			return;
		}

		var container_path = current_prop_state.getContainer().getStatePath();
		var undo_state = current_prop_state;
		var is_initial_state = current_prop_state.getContainer().getInitialState() != undefined
				&& current_prop_state.getContainer().getInitialState().getStateName() == current_prop_state.getStateName();
		var transitions_out = current_prop_state.getContainer().getTransitions().filter(function(element) {
			return element.getFrom().getStateName() == current_prop_state.getStateName();
		});
		var transitions_in = current_prop_state.getContainer().getTransitions().filter(function(element) {
			return element.getFrom().getStateName() != "INIT" && element.getTo().getStateName() == current_prop_state.getStateName();
		});

		var type = "state";
		if (current_prop_state instanceof Statemachine)
			type = "state machine";
		if (current_prop_state instanceof BehaviorState)
			type = "behavior";

		UI.Statemachine.getDisplayedSM().removeState(current_prop_state);
		that.hide();
		UI.Statemachine.refreshView();

		current_prop_state = undefined;

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_REMOVE,
			"Deleted " + type + " " + undo_state.getStateName(),
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				container.addState(undo_state);
				if (is_initial_state) container.setInitialState(undo_state);
				transitions_out.forEach(container.addTransition);
				transitions_in.forEach(container.addTransition);
				UI.Statemachine.refreshView();
			},
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				var state = container.getStateByName(undo_state.getStateName());
				state.getContainer().removeState(state);
				if (UI.Panels.StateProperties.isCurrentState(state)) {
					UI.Panels.StateProperties.hide();
					// current_prop_state is not set to undefined
				}
				UI.Statemachine.refreshView();
			}
		);
	}

	this.isCurrentState = function(state) {
		if (current_prop_state == undefined) return false;

		return current_prop_state.getStatePath() == state.getStatePath();
	}

	this.viewStateSourceCode = function() {
		removeHover();
		var state_type = current_prop_state.getStateType();
		var state_definition = WS.Statelib.getFromLib(state_type);
		try {
			var file_path = state_definition.getFilePath();
			var json_file_dict = {};
			json_file_dict["package"] = state_definition.getStatePackage();
			json_file_dict["file"] = file_path;
			API.post("view_file_source", json_file_dict, (result) => {
				if (result) {
					if (result['result']){
						T.logInfo("State opened for viewing ...");
						Tools.viewSource(state_type, file_path, result['text']);
					} else {
						T.logError("Failed to open the window for viewing source code!");
					}
				} else {
					T.logError("Failed to open the state code!");
					console.log("\x1b[91mFailed to open the state code!\x1b[0m");
				}
			});
		} catch (err) {
			T.logError("Unable to open state in viewer: " + err);
		}
	}

	this.viewBehaviorSourceCode = function() {
		removeHover();

		console.log(`\x1b[94mRequest to view behavior source code for '${current_prop_state.getStatePath()}' \x1b[0m`);
		console.log(JSON.stringify(current_prop_state));
		console.log(current_prop_state.getStateImport());
		var parts = current_prop_state.getStateImport().split(".");
		const package_name = parts[0];
		const state_file = parts[1];
		if (package_name != current_prop_state.getStatePackage()){
			console.log(`\x1b[91m Mismatched packages ${package_name} ${current_prop_state.state_pkg}\x1b[0m`);
		}

		try {
			var file_path = `${package_name}/${state_file}.py`
			console.log(`View behavior '${file_path}' ...`);
			var json_file_dict = {};
			json_file_dict["package"] = package_name;
			json_file_dict["file"] = state_file;
			API.post("view_file_source", json_file_dict, (result) => {
				if (result) {
					console.log(`Behavior '${current_prop_state.getStatePath()}' opened in file viewer.`);
					Tools.viewSource(current_prop_state.getBehaviorName(), file_path, result['text']);
				} else {
					T.logError(`Failed to open the behavior code for '${current_prop_state.getStatePath()}'!`);
					console.log("\x1b[91mFailed to open the behavior code!\x1b[0m");
				}
			});
		} catch (err) {
			T.logError("Unable to open behavior in viewer: " + err);
		}
	}


	this.openStatemachine = function() {
		UI.Statemachine.abortTransition();
		UI.Statemachine.setDisplayedSM(current_prop_state);
		that.hide();
	}

	this.openBehavior = function() {
		UI.Statemachine.abortTransition();
		UI.Statemachine.setDisplayedSM(current_prop_state.getBehaviorStatemachine());
		that.hide();
	}

	this.applyPropertiesClicked = function() {
		removeHover();
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) {

			window.setTimeout(function() {
				document.getElementById('button_apply_properties').style.transition = "none";
				document.getElementById('button_apply_properties').style.background = "#f63";
			}, 100);
			window.setTimeout(function() {
				fadeOutBackground('button_apply_properties');
			}, 200);
			that.displayStateProperties(current_prop_state);
			return;
		}
		if (apply_pulse != undefined) {
			clearTimeout(apply_pulse);
			apply_pulse = undefined;
		}

		var autonomy_old = current_prop_state.getAutonomy().clone();
		var input_old = current_prop_state.getInputMapping().clone();
		var output_old = current_prop_state.getOutputMapping().clone();
		var parameters_old = current_prop_state.getParameterValues().clone();

		// save autonomy
		var autonomy_input = document.getElementById("panel_prop_autonomy_content").getElementsByTagName("select");
		for (var i=0; i<autonomy_input.length; ++i) {
			current_prop_state.getAutonomy()[i] = parseInt(autonomy_input[i].value);
			var transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
				return element.getFrom().getStateName() == current_prop_state.getStateName() && element.getOutcome() == current_prop_state.getOutcomes()[i];
			});
			if (transition_obj != undefined)
				transition_obj.setAutonomy(autonomy_input[i].value);
		}

		// save userdata
		var input_input = document.getElementById("panel_prop_input_keys_content").getElementsByTagName("input");
		for (var i=0; i<input_input.length; ++i) {
			current_prop_state.getInputMapping()[i] = input_input[i].value;
		}
		var output_input = document.getElementById("panel_prop_output_keys_content").getElementsByTagName("input");
		for (var i=0; i<output_input.length; ++i) {
			current_prop_state.getOutputMapping()[i] = output_input[i].value;
		}

		// save parameters (after everything else to avoid troubles with generation)
		var parameter_input = document.getElementById("panel_prop_parameters_content").getElementsByTagName("input");
		var new_parameter_values = [];
		for (let input of parameter_input) {
			let val = input.value;
			let valid_var_type = Checking.determineType(val);
			if (valid_var_type == "unknown"){
				console.log(`treat unknown parameter  <${val}> as text string`);
				if (val.includes("'") || val.includes(`"`)) {
					val = `"""${val}"""`;  // use triple quote in case of embedded quote
				} else {
					val = `"${val}"`;
				}
			}
			new_parameter_values.push(val);
		}
		current_prop_state.setParameterValues(new_parameter_values);

		var autonomy_new = current_prop_state.getAutonomy().clone();
		var input_new = current_prop_state.getInputMapping().clone();
		var output_new = current_prop_state.getOutputMapping().clone();
		var parameters_new = current_prop_state.getParameterValues().clone();

		var state_path = current_prop_state.getStatePath();


		window.setTimeout(function() {
			document.getElementById('button_apply_properties').style.transition = "none";
			document.getElementById('button_apply_properties').style.background = "#9f7";
		}, 100);
		window.setTimeout(function() {
			fadeOutBackground('button_apply_properties');
		}, 200);
		UI.Statemachine.refreshView();

		UI.Panels.StateProperties.displayStateProperties(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Changed properties of state " + current_prop_state.getStateName(),
			function() {
				var state = Behavior.getStatemachine().getStateByPath(state_path);
				state.setAutonomy(autonomy_old);
				state.setInputMapping(input_old);
				state.setOutputMapping(output_old);
				state.setParameterValues(parameters_old);
				for (var i=0; i<autonomy_old.length; ++i) {
					var transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
						return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
					});
					if (transition_obj != undefined)
						transition_obj.setAutonomy(autonomy_old[i]);
				}
				if (UI.Panels.StateProperties.isCurrentState(state)) {
					UI.Panels.StateProperties.displayStateProperties(state);
				}
				UI.Statemachine.refreshView();
			},
			function() {
				var state = Behavior.getStatemachine().getStateByPath(state_path);
				state.setAutonomy(autonomy_new);
				state.setInputMapping(input_new);
				state.setOutputMapping(output_new);
				state.setParameterValues(parameters_new);
				for (var i=0; i<autonomy_new.length; ++i) {
					var transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
						return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
					});
					if (transition_obj != undefined)
						transition_obj.setAutonomy(autonomy_new[i]);
				}
				if (UI.Panels.StateProperties.isCurrentState(state)) {
					UI.Panels.StateProperties.displayStateProperties(state);
				}
				UI.Statemachine.refreshView();
			}
		);
	}

	this.displayStateProperties = function(state) {
		removeHover();
		current_prop_state = state;

		if (state instanceof Statemachine) {
			displayPropertiesForStatemachine(state);
		} else if (state instanceof BehaviorState) {
			displayPropertiesForBehavior(state);
		} else {
			displayPropertiesForState(state);
		}

		that.show();
	}

	this.statePropNameChanged = function() {
		removeHover();
		var id = "";
		var type = "";

		if (current_prop_state instanceof Statemachine) {
			id = "input_prop_sm_name";
			type = "state machine";
		} else if (current_prop_state instanceof BehaviorState) {
			id = "input_prop_be_name";
			type = "behavior";
		} else {
			id = "input_prop_state_name";
			type = "state";
		}

		if (!RC.Controller.isReadonly()
			&& !UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			&& !Behavior.isReadonly()
			&& (!RC.Controller.isLocked() || !RC.Controller.isStateLocked(current_prop_state.getStatePath()))
			&& !RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) {

			var old_name = current_prop_state.getStateName();
			current_prop_state.setStateName(document.getElementById(id).value);
			var new_name = current_prop_state.getStateName();

			var container_path = current_prop_state.getContainer().getStatePath();

			ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
				"Renamed " + type + " from " + old_name + " to " + new_name,
				function() {
					var state = Behavior.getStatemachine().getStateByPath(container_path + "/" + new_name);
					state.setStateName(old_name);
					if (UI.Panels.StateProperties.isCurrentState(state)) {
						document.getElementById(id).value = old_name;
					}
					UI.Statemachine.refreshView();
				},
				function() {
					var state = Behavior.getStatemachine().getStateByPath(container_path + "/" + old_name);
					state.setStateName(new_name);
					if (UI.Panels.StateProperties.isCurrentState(state)) {
						document.getElementById(id).value = new_name;
					}
					UI.Statemachine.refreshView();
				}
			);
		}
		document.getElementById(id).value = current_prop_state.getStateName();

		UI.Statemachine.refreshView();
	}

	this.addSMOutcome = function() {
		removeHover();
		if (document.getElementById("input_prop_outcome_add").value == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;

		var container_path = current_prop_state.getStatePath();
		var new_outcome = document.getElementById("input_prop_outcome_add").value;
		current_prop_state.addOutcome(new_outcome);

		document.getElementById("input_prop_outcome_add").value = "";
		UI.Statemachine.refreshView();
		displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added outcome to container " + current_prop_state.getStateName(),
			function() { // undo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				container.removeOutcome(new_outcome);
				UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				container.addOutcome(new_outcome);
				UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.addSMInputKey = function() {
		removeHover();
		if (document.getElementById("input_prop_input_key_add").value == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;

		var container_path = current_prop_state.getStatePath();
		var new_input_key = document.getElementById("input_prop_input_key_add").value;
		current_prop_state.getInputKeys().push(new_input_key);
		current_prop_state.getInputMapping().push(new_input_key);

		document.getElementById("input_prop_input_key_add").value = "";
		if (UI.Statemachine.isDataflow())
			UI.Statemachine.refreshView();
		displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added input key to container " + current_prop_state.getStateName(),
			function() { // undo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				var idx = container.getInputKeys().indexOf(new_input_key);
				container.getInputKeys().splice(idx, 1);
				container.getInputMapping().splice(idx, 1);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				container.getInputKeys().push(new_input_key);
				container.getInputMapping().push(new_input_key);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.addSMOutputKey = function() {
		removeHover();
		if (document.getElementById("input_prop_output_key_add").value == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;

		var container_path = current_prop_state.getStatePath();
		var new_output_key = document.getElementById("input_prop_output_key_add").value;
		current_prop_state.getOutputKeys().push(new_output_key);
		current_prop_state.getOutputMapping().push(new_output_key);

		document.getElementById("input_prop_output_key_add").value = "";
		if (UI.Statemachine.isDataflow())
			UI.Statemachine.refreshView();
		displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added output key to container " + current_prop_state.getStateName(),
			function() { // undo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				var idx = container.getOutputKeys().indexOf(new_input_key);
				container.getOutputKeys().splice(idx, 1);
				container.getOutputMapping().splice(idx, 1);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				container.getOutputKeys().push(new_input_key);
				container.getOutputMapping().push(new_input_key);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.containerTypeChanged = function(evt) {
		removeHover();
		if(RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;

		var select_box = this;

		var changeType = function(container, to, concurrent, priority) {
			select_box.value = to;
			if (to == 'concurrency') {
				container.setConcurrent(true);
				container.setPriority(false);
				document.getElementById("doc_container_type").innerHTML = "Parallel execution of all elements.";
			} else if (to == 'priority') {
				if (concurrent) {
					container.setConcurrent(false);
				}
				container.setPriority(true);
				document.getElementById("doc_container_type").innerHTML = "Execution supersedes all other containers.";
			} else {
				if (concurrent) {
					container.setConcurrent(false);
				}
				container.setPriority(false);
				document.getElementById("doc_container_type").innerHTML = "Sequential execution based on outcomes.";
			}
		}

		var prev_concurrent = current_prop_state.isConcurrent();
		var prev_priority = current_prop_state.isPriority();
		var prev_type = prev_concurrent? 'concurrency' :
						prev_priority? 'priority' :
						'statemachine';
		var new_type = this.value;

		var container_path = current_prop_state.getStatePath();
		var transitions = current_prop_state.getTransitions().clone();
		var initial_name = current_prop_state.getInitialState() != undefined?
			current_prop_state.getInitialState().getStateName() :
			"";
		var old_sm_outcomes = current_prop_state.getSMOutcomes();

		changeType(current_prop_state, new_type, prev_concurrent, prev_priority);
		UI.Statemachine.refreshView();

		var new_concurrent = current_prop_state.isConcurrent();
		var new_priority = current_prop_state.isPriority();

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Changed container " + current_prop_state.getStateName() + " from " + prev_type + " to " + new_type,
			function() { // undo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				changeType(container, prev_type, new_concurrent, new_priority);
				if (new_concurrent != prev_concurrent) {
					container.setSMOutcomes(old_sm_outcomes);
					transitions.forEach(function(t) {
						if (t.getOutcome() == "" && t.getFrom().getStateName() == "INIT") {
							var old_target = t.getTo();
							if (initial_name != "") {
								container.setInitialState(container.getStateByName(initial_name));
							}
						} else {
							t.setFrom(container.getStateByName(t.getFrom().getStateName()));
							var target = container.getStateByName(t.getTo().getStateName());
							if (target == undefined) {
								target = container.getSMOutcomeByName(t.getTo().getStateName());
							}
							t.setTo(target);
							container.addTransition(t);
						}
					});
				}
				UI.Statemachine.refreshView();
			},
			function() { // redo
				var container = Behavior.getStatemachine().getStateByPath(container_path);
				changeType(container, new_type, prev_concurrent, prev_priority);
				UI.Statemachine.refreshView();
			}
		);
	}

	this.displaySynthesisClicked = function(evt) {
		removeHover();
		if (evt.target.checked) {
			document.getElementById('panel_prop_sm_synthesis').style.display = "block";
			if (RC.ROS.isConnected()) {
				document.getElementById("button_prop_synthesize").removeAttribute("disabled", "disabled");
				document.getElementById("button_prop_synthesize").setAttribute("title", "Send a request to Behavior Synthesis");
			} else {
				document.getElementById("button_prop_synthesize").setAttribute("disabled", "disabled");
				document.getElementById("button_prop_synthesize").setAttribute("title", "Requires ROS connection!");
			}
		} else {
			document.getElementById('panel_prop_sm_synthesis').style.display = "none";
			document.getElementById('input_prop_synthesis_initial').value = "";
			document.getElementById('input_prop_synthesis_goal').value = "";
		}
	}

	this.synthesizeClicked = function() {
		removeHover();
		if(RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;
		var initial_condition = document.getElementById('input_prop_synthesis_initial').value;
		var goal = document.getElementById('input_prop_synthesis_goal').value;
		document.getElementById("cb_display_synthesis").checked = false;
		document.getElementById('panel_prop_sm_synthesis').style.display = "none";

		UI.Statemachine.abortTransition();

		RC.PubSub.requestBehaviorSynthesis(
			current_prop_state.getStatePath(),
			UI.Settings.getSynthesisSystem(),
			goal,
			initial_condition,
			current_prop_state.getOutcomes(),
			function(result) {
				document.getElementById('label_synthesis_feedback').value = "This will delete the current content!";
				document.getElementById('panel_prop_sm_synthesis').style.display = "none";
				document.getElementById('input_prop_synthesis_initial').value = "";
				document.getElementById('input_prop_synthesis_goal').value = "";
			},
			function(feedback) {
				document.getElementById('label_synthesis_feedback').value = feedback.status;
			}
		);
	}

}) ();