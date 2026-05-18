UI.Panels.StateProperties = new (function() {
	var that = this;

	var current_prop_state;
	var apply_pulse = undefined;
	var listeners_to_cleanup = [];
	var synthesis_schema_cache = undefined;
	var synthesis_schema_action_type = undefined;

	var sanitizeTooltipText = function(value) {
		return String(value == undefined ? "" : value)
			.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<\/?[a-z][^>]*>/gi, "");
	}

	var fadeOutBackground = function(id) {
		document.getElementById(id).style.transition = "all 1s ease-out";
		document.getElementById(id).style.backgroundColor = "";
	}

	this.addHoverDocumentation = function(el, type, name, state_class, behavior_name, behavior_pkg) {
		let def = undefined;
		if (state_class) {
			def = WS.Statelib.getFromLib(state_class);
		} else if (behavior_name) {
			def = behavior_pkg
				? WS.Behaviorlib.getByKey(behavior_pkg, behavior_name)
				: WS.Behaviorlib.getByName(behavior_name);
		}
		if (def == undefined) return;
		let doc = undefined;
		switch (type) {
			case "param": doc = def.getParamDesc().findElement(function(el) { return el.name == name; }); break;
			case "input": doc = def.getInputDesc().findElement(function(el) { return el.name == name; }); break;
			case "output": doc = def.getOutputDesc().findElement(function(el) { return el.name == name; }); break;
			case "outcome": doc = def.getOutcomeDesc().findElement(function(el) { return el.name == name; }); break;
		}
		if (doc == undefined) return;

		const addHoverHandler = function() {
			let rect = this.getBoundingClientRect();
			let tt = document.createElement("div");
			tt.setAttribute("style", "right: 370px; top: " + rect.top + "px; display: block;");
			tt.setAttribute("class", "sidepanel_tooltip");
			tt.setAttribute("id", "properties_tooltip");
			tt.textContent = "";
			if (type != "outcome") {
				let typeRow = document.createElement("div");
				typeRow.style.marginBottom = "0.5em";
				typeRow.textContent = "Type: ";
				let typeValue = document.createElement("i");
				typeValue.textContent = sanitizeTooltipText(doc.type);
				typeRow.appendChild(typeValue);
				tt.appendChild(typeRow);
			}
			let desc = document.createElement("div");
			if (doc.desc !== null && typeof doc.desc === 'object') {
				let defaultRow = document.createElement("div");
				defaultRow.style.marginBottom = "0.5em";
				defaultRow.textContent = "Default: ";
				let defaultVal = document.createElement("i");
				defaultVal.textContent = sanitizeTooltipText(doc.desc.default_value);
				defaultRow.appendChild(defaultVal);
				desc.appendChild(defaultRow);
				let labelHint = document.createElement("div");
				labelHint.textContent = sanitizeTooltipText(doc.desc.label) + ": " + sanitizeTooltipText(doc.desc.hint);
				desc.appendChild(labelHint);
				if (doc.desc.extra) {
					let extraRow = document.createElement("div");
					extraRow.style.marginTop = "0.5em";
					if (doc.desc.extra.kind === "range") {
						extraRow.textContent = "Value range: " + sanitizeTooltipText(doc.desc.extra.min)
							+ " - " + sanitizeTooltipText(doc.desc.extra.max);
					} else if (doc.desc.extra.kind === "enum") {
						extraRow.textContent = "Possible values:";
						doc.desc.extra.options.forEach(function(opt) {
							let optRow = document.createElement("div");
							optRow.style.paddingLeft = "1em";
							optRow.textContent = "- " + sanitizeTooltipText(opt);
							extraRow.appendChild(optRow);
						});
					}
					desc.appendChild(extraRow);
				}
			} else {
				desc.style.whiteSpace = "pre-wrap";
				desc.textContent = sanitizeTooltipText(doc.desc);
			}
			tt.appendChild(desc);
			document.getElementsByTagName("body")[0].appendChild(tt);
		}
		el.addEventListener('mouseover', addHoverHandler);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseover', 'handler': addHoverHandler});

		el.addEventListener('mouseout', that.removeHover);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseout', 'handler': that.removeHover});

	}

	this.removeHover = function() {
		let tt = document.getElementById("properties_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}
	}

	var getSynthesisFieldsContainer = function() {
		return document.getElementById('panel_prop_synthesis_fields');
	}

	var refreshStateMachineTabTargets = function() {
		if (UI.Panels == undefined
			|| UI.Panels.updatePanelTabTargets == undefined
			|| UI.Panels.isActivePanel == undefined
			|| !UI.Panels.isActivePanel(UI.Panels.STATE_PROPERTIES_PANEL)) {
			return;
		}
		UI.Panels.updatePanelTabTargets(UI.Panels.STATE_PROPERTIES_PANEL, 'statemachine');
	}

	var clearSynthesisFields = function() {
		let container = getSynthesisFieldsContainer();
		container.innerHTML = "";
		refreshStateMachineTabTargets();
	}

	var getSynthesisFieldDefault = function(field_path) {
		switch (field_path) {
			case 'request.name':
			case 'request.spec_name':
				return current_prop_state ? current_prop_state.getStatePath() : '';
			case 'request.system':
			case 'request.system_name':
				return UI.Settings.getSynthesisSystem();
			case 'request.sm_outcomes':
				return current_prop_state ? current_prop_state.getOutcomes().slice() : [];
			case 'request.specification_file_name':
			case 'synthesis_options':
				return '';
			case 'request.synthesis_timeout_s':
				return UI.Settings.getSynthesisTimeout();
			default:
				return undefined;
		}
	}

	var setSynthesisInputValue = function(input, schema, value) {
		if (value === undefined) {
			return;
		}
		if (schema.kind === 'boolean') {
			input.checked = Boolean(value);
			return;
		}
		if (schema.kind === 'sequence') {
			input.value = Array.isArray(value) ? value.join(', ') : String(value);
			return;
		}
		input.value = String(value);
	}

	var parseSynthesisInputValue = function(input, schema) {
		if (schema.kind === 'boolean') {
			return input.checked;
		}
		if (schema.kind === 'integer') {
			let value = input.value.trim();
			return value === '' ? 0 : parseInt(value, 10);
		}
		if (schema.kind === 'number') {
			let value = input.value.trim();
			return value === '' ? 0 : parseFloat(value);
		}
		if (schema.kind === 'sequence') {
			let raw = input.value.trim();
			if (raw === '') return [];
			let parts = raw.split(',').map(entry => entry.trim()).filter(entry => entry !== '');
			if (schema.element_kind === 'integer') {
				return parts.map(entry => parseInt(entry, 10));
			}
			if (schema.element_kind === 'number') {
				return parts.map(entry => parseFloat(entry));
			}
			if (schema.element_kind === 'boolean') {
				return parts.map(entry => entry.toLowerCase() === 'true');
			}
			return parts;
		}
		return input.value;
	}

	var renderSynthesisSchemaField = function(schema, parent, path_prefix='') {
		let field_path = path_prefix ? path_prefix + '.' + schema.name : schema.name;
		if (schema.kind === 'message') {
			let group = document.createElement('div');
			group.className = 'sidepanel_group';
			group.style.marginBottom = '0.75em';
			let title = document.createElement('div');
			title.style.fontWeight = 'bold';
			title.style.marginTop = '0.5em';
			title.style.marginBottom = '0.25em';
			title.textContent = schema.name;
			group.appendChild(title);
			(schema.fields || []).forEach((child) => {
				renderSynthesisSchemaField(child, group, field_path);
			});
			parent.appendChild(group);
			return;
		}

		let wrapper = document.createElement('div');
		wrapper.style.marginBottom = '0.5em';
		let label = document.createElement('div');
		label.textContent = schema.name + ':';
		wrapper.appendChild(label);

		let input = document.createElement('input');
		input.className = 'input_field';
		input.setAttribute('id', 'input_prop_synthesis_' + field_path.replaceAll('.', '__'));
		if (schema.kind === 'boolean') {
			input.type = 'checkbox';
		} else if (schema.kind === 'integer' || schema.kind === 'number') {
			input.type = 'number';
			if (schema.kind === 'number') {
				input.step = 'any';
			}
		} else {
			input.type = 'text';
		}
		if (schema.kind === 'sequence') {
			input.placeholder = 'comma-separated values';
		}
		setSynthesisInputValue(input, schema, getSynthesisFieldDefault(field_path));
		wrapper.appendChild(input);
		parent.appendChild(wrapper);
	}

	var renderSynthesisSchema = function(schema_fields) {
		clearSynthesisFields();
		let container = getSynthesisFieldsContainer();
		schema_fields.forEach((field) => {
			renderSynthesisSchemaField(field, container);
		});
		refreshStateMachineTabTargets();
	}

	var buildSynthesisPayloadField = function(schema, path_prefix='') {
		let field_path = path_prefix ? path_prefix + '.' + schema.name : schema.name;
		if (schema.kind === 'message') {
			let value = {};
			(schema.fields || []).forEach((child) => {
				value[child.name] = buildSynthesisPayloadField(child, field_path);
			});
			return value;
		}
		let input = document.getElementById('input_prop_synthesis_' + field_path.replaceAll('.', '__'));
		if (input == undefined) {
			return undefined;
		}
		return parseSynthesisInputValue(input, schema);
	}

	var buildSynthesisPayload = function() {
		if (synthesis_schema_cache == undefined) {
			return undefined;
		}
		let payload = {};
		synthesis_schema_cache.forEach((field) => {
			payload[field.name] = buildSynthesisPayloadField(field);
		});
		return payload;
	}

	var loadSynthesisSchema = function(callback) {
		let action_type = UI.Settings.getSynthesisType();
		if (synthesis_schema_cache != undefined && synthesis_schema_action_type === action_type) {
			callback(synthesis_schema_cache);
			return;
		}

		API.postData('action_schema', {action_type: action_type}, (result_data) => {
			synthesis_schema_cache = result_data.goal_fields || [];
			synthesis_schema_action_type = action_type;
			callback(synthesis_schema_cache);
		}, (error) => {
			T.logError('Failed to load synthesis action schema.');
			T.logInfo(error);
			clearSynthesisFields();
		});
	}

	this.addAutocomplete = function(el, state_type, mode, state, additional_keywords) {
		additional_keywords = additional_keywords || [];
		if (state_type != undefined) {
			let state_def = WS.Statelib.getFromLib(state_type);
			if (state_def == undefined) return;
			let state_prefix = (!UI.Settings.isExplicitStates() && WS.Statelib.isClassUnique(state_def.getStateClass()))?
				state_def.getStateClass() : state_def.getStatePackage() + "__" + state_def.getStateClass();
			let class_vars = state_def.getClassVariables();
			for (let i = 0; i < class_vars.length; i++) {
				let class_var = class_vars[i];
				additional_keywords.push({text: class_var, hint: "", fill: state_prefix + "." + class_var});
			}
			additional_keywords.push({text: state_def.getStateClass(), hint: "", fill: state_prefix + "."});
		}

		const autoCompleteSetup = function(evt) {
			let ac = document.getElementById("properties_autocomplete");
			let suggestions = (mode == "input")? Autocomplete.generateInputUserdata(el.value, state) :
							  (mode == "output")? Autocomplete.generateOutputUserdata(el.value, state) :
							  (state_type != undefined)? Autocomplete.generateStateParameterList(el.value) :
							   Autocomplete.generateList(el.value, additional_keywords, state);
			const acceptSuggestion = function(fill) {
				// Treat autocomplete acceptance like a real edit so blur/change-based
				// persistence paths observe the selected value immediately.
				el.value = fill;
				el.dispatchEvent(new Event('input', {bubbles: true}));
				el.dispatchEvent(new Event('change', {bubbles: true}));
				ac.setAttribute("style", "display: none;");
				ac.setAttribute("idx", "0");
			}

			if (suggestions.length == 0) {
				ac.setAttribute("style", "display: none;");
				return;
			}
			let idx = parseInt(ac.getAttribute("idx"));
			if (idx != -1 && (evt.key === 'Enter')) {
				acceptSuggestion(suggestions[idx].fill);
				return;
			}
			if (evt.key === 'ArrowDown') { idx = Math.min(idx + 1, Math.min(suggestions.length - 1, 9)); ac.setAttribute("idx", idx); }
			else if (evt.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); ac.setAttribute("idx", idx); }
			else { ac.setAttribute("idx", "0"); }
			let rect = el.getBoundingClientRect();
			ac.setAttribute("style", "width: " + (rect.width-5) + "px; left: " + (rect.left) + "px; top: " + (rect.top + rect.height) + "px; display: block;");
			that.clearChildElements(ac.id + "_suggestion_");
			ac.innerHTML = "";
			for (let i = 0; i < Math.min(suggestions.length, 10); i++) {
				let s = suggestions[i];
				let chars = s.text.length + s.hint.length;
				let hint = (chars < 30)? s.hint : s.hint.substring(0,25-s.text.length) + "...";
				let div = document.createElement("div");
				div.style.backgroundColor = (i==idx)? "#def": "";
				div.style.padding = "2px";
				div.setAttribute("title", s.hint);
				div.setAttribute("fill", s.fill);
				div.setAttribute('id', ac.id + "_suggestion_" + i);
				const mouseDownHandler = function(event) {
					// Prevent the input from blurring before click selection resolves;
					// this avoids saving the partial text instead of the suggestion.
					event.preventDefault();
				};
				div.addEventListener('mousedown', mouseDownHandler);
				listeners_to_cleanup.push({'element': div, 'listener_type': 'mousedown', 'handler': mouseDownHandler});
				const clickHandler = function(event) {
					acceptSuggestion(div.getAttribute("fill"));
				};
				div.addEventListener('click', clickHandler);
				listeners_to_cleanup.push({'element': div, 'listener_type': 'click', 'handler': clickHandler});

				let hintSpan = document.createElement("span");
				hintSpan.style.float = "right";
				hintSpan.style.color = "grey";
				hintSpan.textContent = hint;
				div.appendChild(hintSpan);
				div.appendChild(document.createTextNode(s.text));
				ac.appendChild(div);
			};
			el.setSelectionRange(el.value.length, el.value.length);
		}
		el.addEventListener('keyup', autoCompleteSetup);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'keyup', 'handler': autoCompleteSetup});

		const autoCompleteHandler = function(evt) {
			let ac = document.getElementById("properties_autocomplete");
			setTimeout(function() {
				// Delay teardown briefly so a click on a suggestion can complete
				// before the blur handler removes the suggestion nodes.
				ac.setAttribute("style", "display: none;");
				ac.setAttribute("idx", "0");
				that.clearChildElements(ac.id + "_suggestion_");
			}, 200);
		}
		el.addEventListener('blur', autoCompleteHandler);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'blur', 'handler': autoCompleteHandler});

	}

	this.displayPropertiesForState = function(state) {
		document.getElementById("panel_properties_state").style.display = "block";
		document.getElementById("panel_properties_behavior").style.display = "none";
		document.getElementById("panel_properties_statemachine").style.display = "none";

		document.getElementById("input_prop_state_name").value = state.getStateName();
		document.getElementById("label_prop_state_class").innerText = state.getStateClass();
		document.getElementById("label_prop_state_package").innerText = state.getStatePackage();
		let state_definition = WS.Statelib.getFromLib(state.getStateType());
		document.getElementById("label_prop_state_desc").innerText = (state_definition != undefined)
			? state_definition.getStateDesc()
			: "";

		const highlightApplyButton = function() {
			if (apply_pulse != undefined) return;
			apply_button = document.getElementById("button_apply_properties");
			apply_button.style.backgroundColor = "#fd5";

			apply_button.style.transition = "all 0.25s ease-in";
			is_on = false;

			let border_pulse = function() {
				if (is_on) {
					apply_button.style.backgroundColor = "black";
					apply_button.style.color = "white";
				} else {
					apply_button.style.backgroundColor = "white";
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
			for (let i=0; i<params.length; ++i) {
				let tr = document.createElement("tr");
				let td_label = document.createElement("td");
				td_label.innerText =  params[i] + ": ";
				let td_input = document.createElement("td");
				let input_field = document.createElement("input");
				input_field.setAttribute("id", "panel_prop_parameters_content_" + i )
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", values[i]);
				input_field.setAttribute("title", VarSolver.resolveAsList(values[i]).join(", "));
				input_field.style.backgroundColor = Checking.setColorByEntryType(values[i]);
				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_parameters_content").appendChild(tr);

				that.addHoverDocumentation(tr, "param", params[i], state.getStateType());

				that.addAutocomplete(input_field, state.getStateType(), undefined, state);

				const setEntryColor = function() {
					input_field.style.backgroundColor = Checking.setColorByEntryType(input_field.value);
				}
				input_field.addEventListener('blur', setEntryColor );
				input_field.addEventListener('change', highlightApplyButton);
				listeners_to_cleanup.push({'element': input_field, 'listener_type': 'blur', 'handler': setEntryColor});
				listeners_to_cleanup.push({'element': input_field, 'listener_type': 'change', 'handler': highlightApplyButton});
			}
		} else {
			document.getElementById("panel_prop_parameters_content").innerHTML = "";
			document.getElementById("panel_prop_parameters").style.display = "none";
		}

		let outcome_list_complete = state.getOutcomes();
		let autonomy_list_complete = state.getAutonomy();
		if (outcome_list_complete.length > 0) {
			document.getElementById("panel_prop_autonomy").style.display = "block";
			document.getElementById("panel_prop_autonomy_content").innerHTML = "";
			for (let i=0; i<outcome_list_complete.length; ++i) {
				let tr = document.createElement("tr");
				let labelTd = document.createElement("td");
				labelTd.textContent = outcome_list_complete[i] + ": ";
				let selectTd = document.createElement("td");
				let select = document.createElement("select");
				select.setAttribute("class", "select_box");
				select.setAttribute("id", "panel_prop_autonomy_content_" + i);
				select.setAttribute("tabindex", "0");
				let options = [
					{value: "0", text: "Off", color: "black"},
					{value: "1", text: "Low", color: "blue"},
					{value: "2", text: "High", color: "green"},
					{value: "3", text: "Full", color: "red"}
				];
				options.forEach(function(opt) {
					let option = document.createElement("option");
					option.value = opt.value;
					option.textContent = opt.text;
					option.style.color = opt.color;
					if (autonomy_list_complete[i] == parseInt(opt.value)) {
						option.selected = true;
					}
					select.appendChild(option);
				});
				selectTd.appendChild(select);
				tr.appendChild(labelTd);
				tr.appendChild(selectTd);
				document.getElementById("panel_prop_autonomy_content").appendChild(tr);
				that.addHoverDocumentation(tr, "outcome", outcome_list_complete[i], state.getStateType());
			}
		} else {
			document.getElementById("panel_prop_autonomy_content").innerHTML = "";
			document.getElementById("panel_prop_autonomy").style.display = "none";
		}

		input_keys = state.getInputKeys();
		input_mapping = state.getInputMapping();
		if (input_keys.length > 0) {
			document.getElementById("panel_prop_input_keys").style.display = "block";
			document.getElementById("panel_prop_input_keys_content").innerHTML = "";
			for (let i=0; i<input_keys.length; ++i) {
				let tr = document.createElement("tr");
				let td_label = document.createElement("td");
				td_label.innerText =  input_keys[i] + ": ";
				let td_input = document.createElement("td");
				let input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("id", "panel_prop_input_keys_content_" + i)
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", input_mapping[i]);
				input_field.addEventListener('change', highlightApplyButton);
				listeners_to_cleanup.push({'element': input_field, 'listener_type': 'change', 'handler': highlightApplyButton});

				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_input_keys_content").appendChild(tr);

				that.addHoverDocumentation(tr, "input", input_keys[i], state.getStateType());
				that.addAutocomplete(input_field, state.getStateType(), "input", state);
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
			for (let i=0; i<output_keys.length; ++i) {
				let tr = document.createElement("tr");
				let td_label = document.createElement("td");
				td_label.innerText =  output_keys[i] + ": ";
				let td_input = document.createElement("td");
				let input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("id", "panel_prop_output_keys_content_" + i);
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", output_mapping[i]);
				input_field.addEventListener('change', highlightApplyButton);
				listeners_to_cleanup.push({'element': input_field, 'listener_type': 'change', 'handler': highlightApplyButton});

				td_input.appendChild(input_field);
				tr.appendChild(td_label);
				tr.appendChild(td_input);
				document.getElementById("panel_prop_output_keys_content").appendChild(tr);

				that.addHoverDocumentation(tr, "output", output_keys[i], state.getStateType());

				that.addAutocomplete(input_field, state.getStateType(), "output", state);
			}
		} else {
			document.getElementById("panel_prop_output_keys").style.display = "none";
			document.getElementById("panel_prop_output_keys_content").innerHTML = "";
		}
	}

	this.displayPropertiesForStatemachine = function(state) {
		document.getElementById("panel_properties_state").style.display = "none";
		document.getElementById("panel_properties_behavior").style.display = "none";
		document.getElementById("panel_properties_statemachine").style.display = "block";

		document.getElementById("input_prop_sm_name").value = state.getStateName();

		if (state.isConcurrent()) {
			document.getElementById("select_container_type").value = "concurrency";
			document.getElementById("doc_container_type").textContent = "Parallel execution of all elements.";
		} else if (state.isPriority()) {
			document.getElementById("select_container_type").value = "priority";
			document.getElementById("doc_container_type").textContent = "Execution supersedes all other containers.";
		} else {
			document.getElementById("select_container_type").value = "statemachine";
			document.getElementById("doc_container_type").textContent = "Sequential execution based on outcomes.";
		}

		// Outcomes
		//----------
		document.getElementById("panel_prop_sm_outcomes_content").innerHTML = "";
		for (let i=0; i<state.getOutcomes().length; ++i) {
			const outcome = state.getOutcomes()[i];
			const selectElement = document.createElement('select');
			selectElement.className = 'select_box';
			selectElement.id = 'panel_prop_sm_outcomes_content_' + i;
			selectElement.tabIndex = 0;

			// Create the options
			const options = [
				{ value: '0', text: 'Off', color: 'black' },
				{ value: '1', text: 'Low', color: 'blue' },
				{ value: '2', text: 'High', color: 'green' },
				{ value: '3', text: 'Full', color: 'red' },
				{ value: '-1', text: 'Inherit', color: 'gray', fontStyle: 'italic' }
			];

			options.forEach(option => {
				const opt = document.createElement('option');
				opt.value = option.value;
				opt.textContent = option.text;
				opt.style.color = option.color;

				if (option.fontStyle) {
					opt.style.fontStyle = option.fontStyle;
				}

				if (state.getAutonomy()[i] == option.value) {
					opt.selected = true;
				}

				selectElement.appendChild(opt);
			});


			const autonomyChangeHandler = function(event) {
				// If a match is found, return the integer part as an integer
				const autonomy = parseInt(event.target.value);
				if (state.getAutonomy()[i] != autonomy) {
					const oldAutonomy = state.getAutonomy()[i];
					state.getAutonomy()[i] = autonomy;
					let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
						return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
					});
					if (transition_obj != undefined)
						transition_obj.setAutonomy(autonomy);
					UI.Statemachine.refreshView();
					console.log(`State machine '${state.getStateName()}' outcome '${state.getOutcomes()[i]}' autonomy level ${event.target.value} changed!`);

					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed autonomy level of state machine '" + state.getStateName() + "'",
						function() { // undo
							let container = Behavior.getStatemachine().getStateByPath(state.getStatePath());
							let ndx = container.getOutcomes().indexOf(outcome);
							if (ndx == -1) {
								console.log(`invalid outcome '${outcome}' for '${state.getStateByPath()}' - cannot undo`);
								return;
							}
							state.getAutonomy()[ndx] = oldAutonomy;
							let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
								return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
							});
							if (transition_obj != undefined)
								transition_obj.setAutonomy(oldAutonomy);
							UI.Statemachine.refreshView();
							if (container == current_prop_state)
								that.displayPropertiesForStatemachine(current_prop_state);
						},
						function() { // redo
							let container = Behavior.getStatemachine().getStateByPath(state.getStatePath());
							let ndx = container.getOutcomes().indexOf(outcome);
							if (ndx == -1) {
								console.log(`invalid outcome '${outcome}' for '${state.getStateByPath()}' - cannot redo`);
								return;
							}
							state.getAutonomy()[ndx] = autonomy;
							let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
								return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
							});
							if (transition_obj != undefined)
								transition_obj.setAutonomy(autonomy);
							UI.Statemachine.refreshView();
							if (container == current_prop_state)
								that.displayPropertiesForStatemachine(current_prop_state);
						}
					);

				}
			}
			selectElement.addEventListener("change", autonomyChangeHandler);
			listeners_to_cleanup.push({'element': selectElement, 'listener_type': 'change', 'handler': autonomyChangeHandler});

			let remove_button = document.createElement("img");
			remove_button.setAttribute("id", "panel_prop_sm_outcomes_content_" + i + "_remove");
			remove_button.setAttribute("tabindex", "0");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this outcome");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("outcome", state.getOutcomes()[i]);
			const removeHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				let removed_outcome = remove_button.getAttribute("outcome");
				let removed_snapshot = state.removeOutcome(removed_outcome);
				let row = remove_button.parentNode;
				row.parentNode.removeChild(row);
				UI.Statemachine.refreshView();
				let container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed outcome from container " + current_prop_state.getStateName(),
					function() { // undo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						container.restoreOutcome(removed_snapshot);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						container.removeOutcome(removed_outcome);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					}
				);
			}
			remove_button.addEventListener("click", removeHandler);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

			const onEnterRemove = function(event) {
				if(event.key === 'Enter' || event.key === ' ') {
					removeHandler(event);
				}
			}
			remove_button.addEventListener("keydown", onEnterRemove);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

			let label = document.createElement("td");
			label.textContent = state.getOutcomes()[i] + ": ";
			let input_field = document.createElement("td");
			input_field.appendChild(selectElement);

			let row = document.createElement("tr");
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
		for (let i=0; i<input_keys.length; ++i) {
			let label = document.createElement("td");
			label.textContent = input_keys[i] + ": ";

			let input_field = document.createElement("input");
			input_field.setAttribute("id", "panel_prop_sm_input_keys_content_" + input_keys[i]);
			input_field.setAttribute("tabindex", "0");
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
				let input_key = input_field.getAttribute("input_key");
				let idx = state.getInputKeys().indexOf(input_key);
				let old_mapping_value = state.getInputMapping()[idx];
				let new_mapping_value = input_field.value
				state.getInputMapping()[idx] = new_mapping_value;
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				let container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Changed input mapping of container " + current_prop_state.getStateName(),
					function() { // undo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = state.getInputKeys().indexOf(input_key);
						container.getInputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = state.getInputKeys().indexOf(input_key);
						container.getInputMapping()[idx] = new_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});
			let input_field_td = document.createElement("td");
			input_field_td.appendChild(input_field);
			that.addAutocomplete(input_field, undefined, "input", state);

			let remove_button = document.createElement("img");
			remove_button.setAttribute("id", "panel_prop_sm_input_keys_content_" + input_keys[i] + "_remove");
			remove_button.setAttribute("tabindex", "0");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this input key");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("input_key", input_keys[i]);
			const removeHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				let idx = state.getInputKeys().indexOf(remove_button.getAttribute("input_key"));
				let original_idx = idx;
				let old_input_key = remove_button.getAttribute("input_key");
				let old_input_mapping = state.getInputMapping()[idx];
				state.getInputKeys().remove(old_input_key);
				state.getInputMapping().splice(idx, 1);
				let row = remove_button.parentNode;
				row.parentNode.removeChild(row);
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				let container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed input key of container " + current_prop_state.getStateName(),
					function() { // undo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getInputKeys().splice(original_idx, 0, old_input_key);
						container.getInputMapping().splice(original_idx, 0, old_input_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = container.getInputKeys().indexOf(old_input_key);
						container.getInputKeys().remove(old_input_key);
						if (idx != -1) {
							container.getInputMapping().splice(idx, 1);
						}
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					}
				);
			}
			remove_button.addEventListener("click", removeHandler);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});
			const onEnterRemove = function(event) {
				if(event.key === 'Enter' || event.key === ' ') {
					removeHandler(event);
				}
			}
			remove_button.addEventListener("keydown", onEnterRemove);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

			let row = document.createElement("tr");
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
		for (let i=0; i<output_keys.length; ++i) {
			let label = document.createElement("td");
			label.textContent = output_keys[i] + ": ";

			let input_field = document.createElement("input");
			input_field.setAttribute("id", "panel_prop_sm_outcomes_content_" + output_keys[i]);
			input_field.setAttribute("tabindex", "0");
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
				let output_key = input_field.getAttribute("output_key");
				let idx = state.getOutputKeys().indexOf(output_key);
				let old_mapping_value = state.getOutputMapping()[idx];
				let new_mapping_value = input_field.value
				state.getOutputMapping()[idx] = new_mapping_value;
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				let container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Changed output mapping of container " + current_prop_state.getStateName(),
					function() { // undo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = state.getOutputKeys().indexOf(output_key);
						container.getOutputMapping()[idx] = old_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = state.getOutputKeys().indexOf(output_key);
						container.getOutputMapping()[idx] = new_mapping_value;
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					}
				);
			});
			let input_field_td = document.createElement("td");
			input_field_td.appendChild(input_field);
			that.addAutocomplete(input_field, undefined, "output", state);

			let remove_button = document.createElement("img");
			remove_button.setAttribute("id", "panel_prop_sm_outcomes_content_" + output_keys[i] + "_remove");
			remove_button.setAttribute("tabindex", "0");
			remove_button.setAttribute("src", "img/table_row_delete.png");
			remove_button.setAttribute("title", "Remove this output key");
			remove_button.setAttribute("class", "img_button");
			remove_button.setAttribute("style", "margin-left: 10px;");
			remove_button.setAttribute("output_key", output_keys[i]);
			const removeHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				if (RC.Controller.isReadonly()
					|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
					|| Behavior.isReadonly()
					|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
					|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
					) return;
				let idx = state.getOutputKeys().indexOf(remove_button.getAttribute("output_key"));
				let original_idx = idx;
				let old_output_key = remove_button.getAttribute("output_key");
				let old_output_mapping = state.getOutputMapping()[idx];
				state.getOutputKeys().remove(old_output_key);
				state.getOutputMapping().splice(idx, 1);
				let row = remove_button.parentNode;
				row.parentNode.removeChild(row);
				if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
				let container_path = current_prop_state.getStatePath();
				ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
					"Removed output key of container " + current_prop_state.getStateName(),
					function() { // undo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						container.getOutputKeys().splice(original_idx, 0, old_output_key);
						container.getOutputMapping().splice(original_idx, 0, old_output_mapping);
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					},
					function() { // redo
						let container = Behavior.getStatemachine().getStateByPath(container_path);
						let idx = container.getOutputKeys().indexOf(old_output_key);
						container.getOutputKeys().remove(old_output_key);
						if (idx != -1) {
							container.getOutputMapping().splice(idx, 1);
						}
						UI.Statemachine.refreshView();
						if (container == current_prop_state)
							that.displayPropertiesForStatemachine(current_prop_state);
					}
				);
			}
			remove_button.addEventListener("click", removeHandler);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});
			const onEnterRemove = function(event) {
				if(event.key === 'Enter' || event.key === ' ') {
					removeHandler(event);
				}
			}
			remove_button.addEventListener("keydown", onEnterRemove);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

			let row = document.createElement("tr");
			row.appendChild(label);
			row.appendChild(input_field_td);
			row.appendChild(remove_button);
			document.getElementById("panel_prop_sm_output_keys_content").appendChild(row);
		}
	}

	this.displayPropertiesForBehavior = function(state) {
		let tt = document.getElementById("properties_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}

		document.getElementById("panel_properties_state").style.display = "none";
		document.getElementById("panel_properties_behavior").style.display = "block";
		document.getElementById("panel_properties_statemachine").style.display = "none";

		document.getElementById("input_prop_be_name").value = state.getStateName();
		document.getElementById("label_prop_be_class").innerText = state.getBehaviorName();
		document.getElementById("label_prop_be_package").innerText = state.getStatePackage();
		let behavior_definition = WS.Behaviorlib.getByKey(state.getStatePackage(), state.getBehaviorName());
		document.getElementById("label_prop_be_desc").innerText = (behavior_definition != undefined)
			? behavior_definition.getBehaviorDesc()
			: "";

		// Parameters
		//-----------
		params = state.getParameters();
		values = state.getParameterValues();
		if (params.length > 0) {
			document.getElementById("panel_prop_be_parameters").style.display = "block";
			document.getElementById("panel_prop_be_parameters_content").innerHTML = "";
			for (let i=0; i<params.length; ++i) {
				let param_def = state.getParameterDefinition(params[i]);
				let default_value = param_def.default;
				default_value = (param_def.type == "text" || param_def.type == "enum")? '"' + default_value + '"' : default_value;
				let label = document.createElement("td");
				label.textContent = params[i] + ": ";

				let input_field = document.createElement("input");
				input_field.setAttribute("id", "panel_prop_be_parameters_content" + i);
				input_field.setAttribute("tabindex", "0");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", (values[i] !== undefined) ? values[i] : default_value);
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
							//console.log(`displayPropertiesForBehavior input_field blur ${input_field.value} - just return`);
							//input_field.value = !input_field.value; <======= ?
							return;
						}
					let param_key = input_field.getAttribute("param_key");
					let param_value = input_field.value;
					let idx = state.getParameters().indexOf(param_key);
					let old_value = state.getParameterValues()[idx];
					state.getParameterValues()[idx] = param_value;
					let behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed parameter value of behavior " + current_prop_state.getStateName(),
						function() { // undo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getParameters().indexOf(param_key);
							behavior_state.getParameterValues()[idx] = old_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						},
						function() { // redo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getParameters().indexOf(param_key);
							behavior_state.getParameterValues()[idx] = param_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						}
					);
				});
				let input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				let additional_keywords = undefined;
				if (param_def.type == "enum") {
					additional_keywords = [];
					param_def.additional.forEach(opt => {
						additional_keywords.push({text: opt, hint: "enum", fill: '"' + opt + '"'});
					});
				}
				that.addAutocomplete(input_field, undefined, undefined, undefined, additional_keywords);

				let default_checkbox = document.createElement("input");
				default_checkbox.setAttribute("id",  "panel_prop_be_parameters_default" + i);
				default_checkbox.setAttribute("type", "checkbox");
				default_checkbox.setAttribute("param_key", params[i]);
				if (values[i] == undefined) {
					default_checkbox.setAttribute("checked", "checked");
				}
				const defaultHandler = function(event) {
					event.preventDefault(); // Prevent default action
					event.stopPropagation(); // Stop the event from propagating to other handlers
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					let param_key = default_checkbox.getAttribute("param_key");
					let param_value = input_field.value;
					let behavior_path = current_prop_state.getStatePath();
					let make_default = function() {
						let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						let idx = behavior_state.getParameters().indexOf(param_key);
						behavior_state.getParameterValues()[idx] = undefined;
						if (behavior_state == current_prop_state) {
							that.displayStateProperties(current_prop_state);
						}
					}
					let remove_default = function() {
						let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						let idx = behavior_state.getParameters().indexOf(param_key);
						behavior_state.getParameterValues()[idx] = param_value;
						if (behavior_state == current_prop_state) {
							that.displayStateProperties(current_prop_state);
						}
					}
					if(default_checkbox.checked) {
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
				}
				default_checkbox.addEventListener("change", defaultHandler);
				listeners_to_cleanup.push({'element': default_checkbox, 'listener_type': 'change', 'handler': defaultHandler});
				const onEnterToggleDefault = function(event) {
					if(event.key === 'Enter' || event.key === ' ') {
						default_checkbox.checked = !default_checkbox.checked; // Toggle checkbox state
						default_checkbox.dispatchEvent(new Event('change')); // Trigger change event
					}
				}
				default_checkbox.addEventListener("keydown", onEnterToggleDefault);
				listeners_to_cleanup.push({'element': default_checkbox, 'listener_type': 'keydown', 'handler': onEnterToggleDefault});

				let default_checkbox_txt = document.createElement("label");
				default_checkbox_txt.innerText = "default";
				let default_checkbox_td = document.createElement("td");
				default_checkbox_td.setAttribute("title", "Use the default value as defined by the behavior.");
				default_checkbox_td.appendChild(default_checkbox);
				default_checkbox_td.appendChild(default_checkbox_txt);

				let row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				row.appendChild(default_checkbox_td);
				document.getElementById("panel_prop_be_parameters_content").appendChild(row);

				that.addHoverDocumentation(row, "param", params[i], undefined, state.getBehaviorName(), state.getStatePackage());
			}
		} else {
			document.getElementById("panel_prop_be_parameters").style.display = "none";
		}

		// Autonomy
		//----------
		let outcome_list_complete = state.getOutcomes();
		let autonomy_list_complete = state.getAutonomy();
		if (outcome_list_complete.length > 0) {
			document.getElementById("panel_prop_be_autonomy").style.display = "block";
			document.getElementById("panel_prop_be_autonomy_content").innerHTML = "";
			for (let i=0; i<outcome_list_complete.length; ++i) {
				const outcome = state.getOutcomes()[i];
				const selectElement = document.createElement('select');
				selectElement.className = 'select_box';
				selectElement.id = 'panel_prop_be_autonomy_content_' + i;
				selectElement.tabIndex = 0;

				// Create the options
				const options = [
					{ value: '0', text: 'Off', color: 'black' },
					{ value: '1', text: 'Low', color: 'blue' },
					{ value: '2', text: 'High', color: 'green' },
					{ value: '3', text: 'Full', color: 'red' },
					{ value: '-1', text: 'Inherit', color: 'gray', fontStyle: 'italic' }
				];

				options.forEach(option => {
					const opt = document.createElement('option');
					opt.value = option.value;
					opt.textContent = option.text;
					opt.style.color = option.color;

					if (option.fontStyle) {
						opt.style.fontStyle = option.fontStyle;
					}

					if (autonomy_list_complete[i] == option.value) {
						opt.selected = true;
					}

					selectElement.appendChild(opt);
				});

				const autonomyChangeHandler = function(event) {
					const autonomy = parseInt(event.target.value);
					if (state.getAutonomy()[i] != autonomy) {
						const oldAutonomy = state.getAutonomy()[i];
						state.getAutonomy()[i] = autonomy;
						let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
							return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
						});
						if (transition_obj != undefined)
							transition_obj.setAutonomy(autonomy);
						UI.Statemachine.refreshView();
						console.log(`Behavior '${state.getStateName()}' outcome '${state.getOutcomes()[i]}' autonomy level ${autonomy} changed!`);

						ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
							"Changed autonomy level of behavior '" + state.getStateName() + "'",
							function() { // undo
								let container = Behavior.getStatemachine().getStateByPath(state.getStatePath());
								let ndx = container.getOutcomes().indexOf(outcome);
								if (ndx == -1) {
									console.log(`invalid outcome '${outcome}' for '${state.getStateByPath()}' - cannot undo`);
									return;
								}
								state.getAutonomy()[ndx] = oldAutonomy;
								let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
									return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
								});
								if (transition_obj != undefined)
									transition_obj.setAutonomy(oldAutonomy);
								UI.Statemachine.refreshView();
								if (container == current_prop_state)
									that.displayPropertiesForBehavior(current_prop_state);
							},
							function() { // redo
								let container = Behavior.getStatemachine().getStateByPath(state.getStatePath());
								let ndx = container.getOutcomes().indexOf(outcome);
								if (ndx == -1) {
									console.log(`invalid outcome '${outcome}' for '${state.getStateByPath()}' - cannot redo`);
									return;
								}
								state.getAutonomy()[ndx] = autonomy;
								let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
									return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
								});
								if (transition_obj != undefined)
									transition_obj.setAutonomy(autonomy);
								UI.Statemachine.refreshView();
								if (container == current_prop_state)
									that.displayPropertiesForBehavior(current_prop_state);
							}
						);
					}
				}
				selectElement.addEventListener("change", autonomyChangeHandler);
				listeners_to_cleanup.push({'element': selectElement, 'listener_type': 'change', 'handler': autonomyChangeHandler});

				let label = document.createElement("td");
				label.textContent = outcome_list_complete[i] + ": ";
				let input_field = document.createElement("td");
				input_field.appendChild(selectElement);
				let row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field);
				document.getElementById("panel_prop_be_autonomy_content").appendChild(row);
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
			for (let i=0; i<input_keys.length; ++i) {
				let label = document.createElement("td");
				label.textContent = input_keys[i] + ": ";

				let input_field = document.createElement("input");
				input_field.setAttribute("id", "panel_prop_be_input_keys_content_" + i);
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", (input_mapping[i] !== undefined) ? input_mapping[i] : input_keys[i]);
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
					let input_key = input_field.getAttribute("input_key");
					let input_value = input_field.value;
					let idx = state.getInputKeys().indexOf(input_key);
					let old_input_value = state.getInputMapping()[idx];
					state.getInputMapping()[idx] = input_value;
					if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					let behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed input mapping of behavior " + current_prop_state.getStateName(),
						function() { // undo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getInputKeys().indexOf(input_key);
							behavior_state.getInputMapping()[idx] = old_input_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						},
						function() { // redo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getInputKeys().indexOf(input_key);
							behavior_state.getInputMapping()[idx] = input_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						}
					);
				});
				let input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				that.addAutocomplete(input_field, undefined, "input", state);

				let default_checkbox = document.createElement("input");
				default_checkbox.setAttribute("id", "panel_prop_be_input_keys_content_" + i + "_default");
				default_checkbox.setAttribute("type", "checkbox");
				default_checkbox.setAttribute("input_key", input_keys[i]);
				if (input_mapping[i] == undefined) {
					default_checkbox.setAttribute("checked", "checked");
				}

				const defaultAutonomyHandler = function(event) {
					event.preventDefault(); // Prevent default action
					event.stopPropagation(); // Stop the event from propagating to other handlers
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					let input_key = default_checkbox.getAttribute("input_key");
					let input_value = input_field.value;
					let behavior_path = current_prop_state.getStatePath();
					let make_default = function() {
						let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						let idx = behavior_state.getInputKeys().indexOf(input_key);
						behavior_state.getInputMapping()[idx] = undefined;
						if (behavior_state == current_prop_state)
							that.displayStateProperties(current_prop_state);
						if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					}
					let remove_default = function() {
						let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
						let idx = behavior_state.getInputKeys().indexOf(input_key);
						behavior_state.getInputMapping()[idx] = input_value;
						if (behavior_state == current_prop_state)
							that.displayStateProperties(current_prop_state);
						if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					}
					if(default_checkbox.checked) {
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
				}
				default_checkbox.addEventListener("change", defaultAutonomyHandler);
				listeners_to_cleanup.push({'element': default_checkbox, 'listener_type': 'change', 'handler': defaultAutonomyHandler});

				const onEnterToggleDefaultAutonomy = function(event) {
					if(event.key === 'Enter' || event.key === ' ') {
						default_checkbox.checked = !default_checkbox.checked; // Toggle checkbox state
						default_checkbox.dispatchEvent(new Event('change')); // Trigger change event
					}
				}
				default_checkbox.addEventListener("keydown", onEnterToggleDefaultAutonomy);
				listeners_to_cleanup.push({'element': default_checkbox, 'listener_type': 'keydown', 'handler': onEnterToggleDefaultAutonomy});

				let default_checkbox_txt = document.createElement("label");
				default_checkbox_txt.innerText = "default";
				let default_checkbox_td = document.createElement("td");
				default_checkbox_td.setAttribute("title", "Use the default value as defined by the behavior.");
				default_checkbox_td.appendChild(default_checkbox);
				default_checkbox_td.appendChild(default_checkbox_txt);

				let row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				row.appendChild(default_checkbox_td);
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
			for (let i=0; i<output_keys.length; ++i) {
				let label = document.createElement("td");
				label.textContent = output_keys[i] + ": ";

				let input_field = document.createElement("input");
				input_field.setAttribute("class", "inline_text_edit");
				input_field.setAttribute("id", "panel_prop_be_output_keys_content" + i);
				input_field.setAttribute("type", "text");
				input_field.setAttribute("value", output_mapping[i]);
				input_field.setAttribute("output_key", output_keys[i]);
				const blurHandler = function() {
					if (RC.Controller.isReadonly()
						|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
						|| Behavior.isReadonly()
						|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
						|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
						) return;
					let output_key = input_field.getAttribute("output_key");
					let output_value = input_field.value;
					let idx = state.getOutputKeys().indexOf(output_key);
					let old_output_value = state.getOutputMapping()[idx];
					state.getOutputMapping()[idx] = output_value;
					if (UI.Statemachine.isDataflow()) UI.Statemachine.refreshView();
					let behavior_path = current_prop_state.getStatePath();
					ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
						"Changed output mapping of behavior " + current_prop_state.getStateName(),
						function() { // undo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getOutputKeys().indexOf(output_key);
							behavior_state.getOutputMapping()[idx] = old_output_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						},
						function() { // redo
							let behavior_state = Behavior.getStatemachine().getStateByPath(behavior_path);
							let idx = behavior_state.getOutputKeys().indexOf(output_key);
							behavior_state.getOutputMapping()[idx] = output_value;
							if (behavior_state == current_prop_state)
								that.displayStateProperties(current_prop_state);
						}
					);
				}
				input_field.addEventListener("change", blurHandler);
				listeners_to_cleanup.push({'element': input_field, 'listener_type': 'change', 'handler': blurHandler});

				let input_field_td = document.createElement("td");
				input_field_td.appendChild(input_field);
				that.addAutocomplete(input_field, undefined, "output", state);

				let row = document.createElement("tr");
				row.appendChild(label);
				row.appendChild(input_field_td);
				document.getElementById("panel_prop_be_output_keys_content").appendChild(row);
			}
		} else {
			document.getElementById("panel_prop_be_output_keys").style.display = "none";
		}
	}

	this.show = function(sub_panel) {
		if (current_prop_state == undefined) {
			T.debugWarn("Current state not set for properties!");
			return;
		}
		UI.Panels.setActivePanel(UI.Panels.STATE_PROPERTIES_PANEL, sub_panel);
		if (apply_pulse != undefined) clearTimeout(apply_pulse);
		document.getElementById('button_apply_properties').style.backgroundColor = "";
		document.getElementById('button_apply_properties').style.color = "";
		UI.Panels.updatePanelTabTargets(UI.Panels.STATE_PROPERTIES_PANEL, sub_panel);
	}

	this.hide = function() {
		that.removeHover();
		that.clearChildElements();
		document.activeElement.blur();
		UI.Panels.hidePanelIfActive(UI.Panels.STATE_PROPERTIES_PANEL);
		current_prop_state = undefined;
		if (apply_pulse != undefined) clearTimeout(apply_pulse);
		document.getElementById('button_apply_properties').style.backgroundColor = "";
		document.getElementById('button_apply_properties').style.color = "";
	}

	this.closePropertiesClicked = function() {
		that.hide();
	}

	this.deleteStateClicked = async function() {
		that.removeHover();
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) {

			let id = "";
			if (current_prop_state instanceof Statemachine) { id = "button_delete_sm"; }
			if (current_prop_state instanceof BehaviorState) { id = "button_delete_be"; }
			else { id = "button_delete_state"; }
			document.getElementById(id).style.transition = "none";
			document.getElementById(id).style.backgroundColor = "#f63";
			window.setTimeout(function() { fadeOutBackground(id); }, 100);
			console.log(`\x1b[93mCannot delete this state for '${id}' (possibly readOnly mode or in another behavior)\x1b[0m`);
			return;
		}

		let userChoice = await UI.Tools.customConfirm(`Confirm deletion of '${current_prop_state.getStateName()}'`);
		if (!userChoice) {
			console.log(`\x1b[93mIgnore request to delete '${current_prop_state.getStateName()}'`);
			return;
		}

		let container_path = current_prop_state.getContainer().getStatePath();
		let undo_state = current_prop_state;
		let is_initial_state = current_prop_state.getContainer().getInitialState() != undefined
				&& current_prop_state.getContainer().getInitialState().getStateName() == current_prop_state.getStateName();
		let transitions_out = current_prop_state.getContainer().getTransitions().filter(function(element) {
			return element.getFrom().getStateName() == current_prop_state.getStateName();
		});
		let transitions_in = current_prop_state.getContainer().getTransitions().filter(function(element) {
			return element.getFrom().getStateName() != "INIT" && element.getTo().getStateName() == current_prop_state.getStateName();
		});

		let type = "state";
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
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				container.addState(undo_state);
				if (is_initial_state) container.setInitialState(undo_state);
				transitions_out.forEach(container.addTransition);
				transitions_in.forEach(container.addTransition);
				UI.Statemachine.refreshView();
			},
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let state = container.getStateByName(undo_state.getStateName());
				state.getContainer().removeState(state);
				if (that.isCurrentState(state)) {
					that.hide();
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
		that.removeHover();
		let state_type = current_prop_state.getStateType();
		let state_definition = WS.Statelib.getFromLib(state_type);
		try {
			let file_path = state_definition.getFilePath();
			let json_file_dict = {};
			json_file_dict["package"] = state_definition.getStatePackage();
			json_file_dict["file"] = file_path;
			UI.Tools.openFileInSourceViewer(
				json_file_dict,
				state_type,
				file_path,
				"State opened for viewing ...",
				"Failed to open the state code!"
			);
		} catch (err) {
			T.logError("Unable to open state in viewer: " + err);
		}
	}

	this.viewBehaviorSourceCode = function() {
		that.removeHover();

		console.log(`\x1b[94mRequest to view behavior source code for '${current_prop_state.getStatePath()}' \x1b[0m`);
		console.log(JSON.stringify(current_prop_state));
		console.log(current_prop_state.getStateImport());
		let parts = current_prop_state.getStateImport().split(".");
		const package_name = parts.shift();
		const state_file = parts.join("/");
		if (package_name != current_prop_state.getStatePackage()){
			console.log(`\x1b[91m Mismatched packages ${package_name} ${current_prop_state.state_pkg}\x1b[0m`);
		}

		try {
			let file_path = `${package_name}/${state_file}.py`
			console.log(`View behavior '${file_path}' ...`);
			let json_file_dict = {};
			json_file_dict["package"] = package_name;
			json_file_dict["file"] = state_file;
			UI.Tools.openFileInSourceViewer(
				json_file_dict,
				current_prop_state.getBehaviorName(),
				file_path,
				`Behavior '${current_prop_state.getStatePath()}' opened in file viewer.`,
				`Failed to open the behavior code for '${current_prop_state.getStatePath()}'!`
			);
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

	this.flushPendingEdits = function() {
		if (current_prop_state instanceof BehaviorState) {
			// BehaviorState fields save on blur (not Apply). Do NOT call applyPropertiesClicked:
			// it reads from the wrong panel (regular-state DOM IDs) and would call
			// setParameterValues([]) / setInputMapping([]), wiping all values.
			// Instead, trigger blur on any focused field to fire its save handler now.
			let active = document.activeElement;
			if (active && active.closest && active.closest('#panel_properties_behavior')) {
				active.blur();
			}
			return;
		}
		if (current_prop_state != undefined) that.applyPropertiesClicked();
	}

	this.applyPropertiesClicked = function() {
		that.removeHover();
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) {

			window.setTimeout(function() {
				document.getElementById('button_apply_properties').style.transition = "none";
				document.getElementById('button_apply_properties').style.backgroundColor = "#f63";
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

		let autonomy_old = current_prop_state.getAutonomy().clone();
		let input_old = current_prop_state.getInputMapping().clone();
		let output_old = current_prop_state.getOutputMapping().clone();
		let parameters_old = current_prop_state.getParameterValues().clone();

		// save autonomy
		let autonomy_input = document.getElementById("panel_prop_autonomy_content").getElementsByTagName("select");
		let expected_autonomy_count = current_prop_state.getOutcomes().length;
		if (autonomy_input.length !== expected_autonomy_count) {
			T.logWarn(`applyPropertiesClicked: autonomy select count (${autonomy_input.length}) != outcome count (${expected_autonomy_count}) — stale display`);
		}
		for (let i=0; i < Math.min(autonomy_input.length, expected_autonomy_count); ++i) {
			current_prop_state.getAutonomy()[i] = parseInt(autonomy_input[i].value);
			let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
				return element.getFrom().getStateName() == current_prop_state.getStateName() && element.getOutcome() == current_prop_state.getOutcomes()[i];
			});
			if (transition_obj != undefined)
				transition_obj.setAutonomy(autonomy_input[i].value);
		}

		// save userdata
		let input_input = document.getElementById("panel_prop_input_keys_content").getElementsByTagName("input");
		let expected_input_count = current_prop_state.getInputKeys().length;
		if (input_input.length !== expected_input_count) {
			T.logWarn(`applyPropertiesClicked: input mapping count (${input_input.length}) != input key count (${expected_input_count}) — stale display`);
		}
		for (let i=0; i < Math.min(input_input.length, expected_input_count); ++i) {
			current_prop_state.getInputMapping()[i] = input_input[i].value;
		}
		let output_input = document.getElementById("panel_prop_output_keys_content").getElementsByTagName("input");
		let expected_output_count = current_prop_state.getOutputKeys().length;
		if (output_input.length !== expected_output_count) {
			T.logWarn(`applyPropertiesClicked: output mapping count (${output_input.length}) != output key count (${expected_output_count}) — stale display`);
		}
		for (let i=0; i < Math.min(output_input.length, expected_output_count); ++i) {
			current_prop_state.getOutputMapping()[i] = output_input[i].value;
		}

		// save parameters (after everything else to avoid troubles with generation)
		let parameter_input = document.getElementById("panel_prop_parameters_content").getElementsByTagName("input");
		let expected_param_count = current_prop_state.getParameters().length;
		if (parameter_input.length !== expected_param_count) {
			T.logWarn(`applyPropertiesClicked: parameter input count (${parameter_input.length}) != parameter count (${expected_param_count}) — stale display`);
		}
		let new_parameter_values = [];
		for (let i = 0; i < Math.min(parameter_input.length, expected_param_count); ++i) {
			let input = parameter_input[i];
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

		let autonomy_new = current_prop_state.getAutonomy().clone();
		let input_new = current_prop_state.getInputMapping().clone();
		let output_new = current_prop_state.getOutputMapping().clone();
		let parameters_new = current_prop_state.getParameterValues().clone();

		let state_path = current_prop_state.getStatePath();


		window.setTimeout(function() {
			document.getElementById('button_apply_properties').style.transition = "none";
			document.getElementById('button_apply_properties').style.backgroundColor = "#9f7";
		}, 100);
		window.setTimeout(function() {
			fadeOutBackground('button_apply_properties');
		}, 200);
		UI.Statemachine.refreshView();

		that.displayStateProperties(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Changed properties of state " + current_prop_state.getStateName(),
			function() {
				let state = Behavior.getStatemachine().getStateByPath(state_path);
				state.setParameterValues(parameters_old);
				state.setAutonomy(autonomy_old);
				state.setInputMapping(input_old);
				state.setOutputMapping(output_old);
				for (let i=0; i<autonomy_old.length; ++i) {
					let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
						return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
					});
					if (transition_obj != undefined)
						transition_obj.setAutonomy(autonomy_old[i]);
				}
				if (that.isCurrentState(state)) {
					that.displayStateProperties(state);
				}
				UI.Statemachine.refreshView();
			},
			function() {
				let state = Behavior.getStatemachine().getStateByPath(state_path);
				state.setParameterValues(parameters_new);
				state.setAutonomy(autonomy_new);
				state.setInputMapping(input_new);
				state.setOutputMapping(output_new);
				for (let i=0; i<autonomy_new.length; ++i) {
					let transition_obj = UI.Statemachine.getDisplayedSM().getTransitions().findElement(function(element) {
						return element.getFrom().getStateName() == state.getStateName() && element.getOutcome() == state.getOutcomes()[i];
					});
					if (transition_obj != undefined)
						transition_obj.setAutonomy(autonomy_new[i]);
				}
				if (that.isCurrentState(state)) {
					that.displayStateProperties(state);
				}
				UI.Statemachine.refreshView();
			}
		);
	}

	this.displayStateProperties = function(state) {
		that.removeHover();
		current_prop_state = state;
		that.clearChildElements(); // clear any old elements
		if (state instanceof Statemachine) {
			that.displayPropertiesForStatemachine(state);
			that.show('statemachine');
		} else if (state instanceof BehaviorState) {
			that.displayPropertiesForBehavior(state);
			that.show('behavior');
		} else {
			that.displayPropertiesForState(state);
			that.show('state');
		}
		UI.Panels.setFocus(); // after updating panel we need to reset the focus
	}

	this.statePropNameChanged = function() {
		that.removeHover();
		let id = "";
		let type = "";

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

			let old_name = current_prop_state.getStateName();
			let new_name = document.getElementById(id).value;
			if (old_name === new_name)	return;

			current_prop_state.setStateName(new_name);
			let confirm_name = current_prop_state.getStateName();
			if (new_name != confirm_name) {
				T.logError("Error renaming " + type + " from " + old_name + " to " + new_name);
				UI.Tools.customAcknowledge("A " + type + " named '" + new_name + "' already exists in this container.<br><br>Select OK to continue.");
				return;
			}
			let container_path = current_prop_state.getContainer().getStatePath();

			ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
				"Renamed " + type + " from " + old_name + " to " + new_name,
				function() {
					let state = Behavior.getStatemachine().getStateByPath(container_path + "/" + new_name);
					state.setStateName(old_name);
					if (that.isCurrentState(state)) {
						document.getElementById(id).value = old_name;
					}
					UI.Statemachine.refreshView();
				},
				function() {
					let state = Behavior.getStatemachine().getStateByPath(container_path + "/" + old_name);
					state.setStateName(new_name);
					if (that.isCurrentState(state)) {
						document.getElementById(id).value = new_name;
					}
					UI.Statemachine.refreshView();
				}
			);
		}
		document.getElementById(id).value = current_prop_state.getStateName();

		UI.Statemachine.refreshView();
	}

	this.addSMOutcome = async function() {
		that.removeHover();
		let input_field = document.getElementById("input_prop_outcome_add");
		let new_outcome = input_field.value.trim();
		if (new_outcome == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;
		if (current_prop_state.getOutcomes().contains(new_outcome)) {
			await UI.Tools.customAcknowledge("Outcome name '" + new_outcome + "' already exists!<br><br>"
											+ "Select button to continue.");
			input_field.focus({ preventScroll: true });
			return;
		}

		let container_path = current_prop_state.getStatePath();
		current_prop_state.addOutcome(new_outcome);

		input_field.value = "";
		UI.Statemachine.refreshView();
		that.displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added outcome to container " + current_prop_state.getStateName(),
			function() { // undo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				container.removeOutcome(new_outcome);
				UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				container.addOutcome(new_outcome);
				UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.addSMInputKey = async function() {
		that.removeHover();
		let input_field = document.getElementById("input_prop_input_key_add");
		let new_input_key = input_field.value.trim();
		if (new_input_key == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;
		if (current_prop_state.getInputKeys().contains(new_input_key)) {
			await UI.Tools.customAcknowledge("Input key '" + new_input_key + "' already exists!<br><br>"
											+ "Select button to continue.");
			input_field.focus({ preventScroll: true });
			return;
		}

		let container_path = current_prop_state.getStatePath();
		let insert_idx = current_prop_state.getInputKeys().length;
		current_prop_state.getInputKeys().push(new_input_key);
		current_prop_state.getInputMapping().push(new_input_key);

		input_field.value = "";
		if (UI.Statemachine.isDataflow())
			UI.Statemachine.refreshView();
		that.displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added input key to container " + current_prop_state.getStateName(),
			function() { // undo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				let idx = container.getInputKeys().indexOf(new_input_key);
				container.getInputKeys().splice(idx, 1);
				container.getInputMapping().splice(idx, 1);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				container.getInputKeys().splice(insert_idx, 0, new_input_key);
				container.getInputMapping().splice(insert_idx, 0, new_input_key);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.addSMOutputKey = async function() {
		that.removeHover();
		let input_field = document.getElementById("input_prop_output_key_add");
		let new_output_key = input_field.value.trim();
		if (new_output_key == "") return;
		if (RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;
		if (current_prop_state.getOutputKeys().contains(new_output_key)) {
			await UI.Tools.customAcknowledge("Output key '" + new_output_key + "' already exists!<br><br>"
											+ "Select button to continue.");
			input_field.focus({ preventScroll: true });
			return;
		}

		let container_path = current_prop_state.getStatePath();
		let insert_idx = current_prop_state.getOutputKeys().length;
		current_prop_state.getOutputKeys().push(new_output_key);
		current_prop_state.getOutputMapping().push(new_output_key);

		input_field.value = "";
		if (UI.Statemachine.isDataflow())
			UI.Statemachine.refreshView();
		that.displayPropertiesForStatemachine(current_prop_state);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Added output key to container " + current_prop_state.getStateName(),
			function() { // undo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				let idx = container.getOutputKeys().indexOf(new_output_key);
				container.getOutputKeys().splice(idx, 1);
				container.getOutputMapping().splice(idx, 1);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			},
			function() { // redo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				container.getOutputKeys().splice(insert_idx, 0, new_output_key);
				container.getOutputMapping().splice(insert_idx, 0, new_output_key);
				if (UI.Statemachine.isDataflow())
					UI.Statemachine.refreshView();
				if (container == current_prop_state)
					that.displayPropertiesForStatemachine(current_prop_state);
			}
		);
	}

	this.containerTypeChanged = function(evt) {
		that.removeHover();
		if(RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;

		let select_box = this;
		const changeType = function(container, to, concurrent, priority) {
			select_box.value = to;
			if (to == 'concurrency') {
				container.setConcurrent(true);
				container.setPriority(false);
				document.getElementById("doc_container_type").textContent = "Parallel execution of all elements.";
			} else if (to == 'priority') {
				if (concurrent) {
					container.setConcurrent(false);
				}
				container.setPriority(true);
				document.getElementById("doc_container_type").textContent = "Execution supersedes all other containers.";
			} else {
				if (concurrent) {
					container.setConcurrent(false);
				}
				container.setPriority(false);
				document.getElementById("doc_container_type").textContent = "Sequential execution based on outcomes.";
			}
		}

		let prev_concurrent = current_prop_state.isConcurrent();
		let prev_priority = current_prop_state.isPriority();
		let prev_type = prev_concurrent? 'concurrency' :
						prev_priority? 'priority' :
						'statemachine';
		let new_type = this.value;

		let container_path = current_prop_state.getStatePath();
		let transitions = current_prop_state.getTransitions().clone();
		let initial_name = current_prop_state.getInitialState() != undefined?
			current_prop_state.getInitialState().getStateName() :
			"";
		let old_sm_outcomes = current_prop_state.getSMOutcomes();

		changeType(current_prop_state, new_type, prev_concurrent, prev_priority);
		UI.Statemachine.refreshView();

		let new_concurrent = current_prop_state.isConcurrent();
		let new_priority = current_prop_state.isPriority();

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Changed container " + current_prop_state.getStateName() + " from " + prev_type + " to " + new_type,
			function() { // undo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				changeType(container, prev_type, new_concurrent, new_priority);
				if (new_concurrent != prev_concurrent) {
					container.withOutcomeCopyNormalizationSuspended(function() {
						container.setSMOutcomes(old_sm_outcomes);
						transitions.forEach(function(t) {
							if (t.getOutcome() == "" && t.getFrom().getStateName() == "INIT") {
								let old_target = t.getTo();
								if (initial_name != "") {
									container.setInitialState(container.getStateByName(initial_name));
								}
							} else {
								t.setFrom(container.getStateByName(t.getFrom().getStateName()));
								let target = container.getStateByName(t.getTo().getStateName());
								if (target == undefined) {
									target = container.getSMOutcomeByName(t.getTo().getStateName());
								}
								t.setTo(target);
								container.addTransition(t);
							}
						});
					});
				}
				UI.Statemachine.refreshView();
			},
			function() { // redo
				let container = Behavior.getStatemachine().getStateByPath(container_path);
				changeType(container, new_type, prev_concurrent, prev_priority);
				UI.Statemachine.refreshView();
			}
		);
	}

	this.displaySynthesisClicked = function(evt) {
		that.removeHover();
		if (evt.target.checked) {
			document.getElementById('panel_prop_sm_synthesis').style.display = "block";
			document.getElementById('input_prop_synthesis_timeout').value = UI.Settings.getSynthesisTimeout();
			if (RC.ROS.isConnected()) {
				document.getElementById("button_prop_synthesize").removeAttribute("disabled", "disabled");
				document.getElementById("button_prop_synthesize").setAttribute("title", "Send a request to Behavior Synthesis");
				loadSynthesisSchema(renderSynthesisSchema);
			} else {
				document.getElementById("button_prop_synthesize").setAttribute("disabled", "disabled");
				document.getElementById("button_prop_synthesize").setAttribute("title", "Requires ROS connection!");
				clearSynthesisFields();
			}
		} else {
			document.getElementById('panel_prop_sm_synthesis').style.display = "none";
			clearSynthesisFields();
		}
	}

	this.synthesizeClicked = function() {
		that.removeHover();
		if(RC.Controller.isReadonly()
			|| UI.Statemachine.getDisplayedSM().isInsideDifferentBehavior()
			|| Behavior.isReadonly()
			|| RC.Controller.isLocked() && RC.Controller.isStateLocked(current_prop_state.getStatePath())
			|| RC.Controller.isOnLockedPath(current_prop_state.getStatePath())
			) return;
		let goal_payload = buildSynthesisPayload();
		if (goal_payload == undefined) {
			T.logError('Unable to build synthesis request payload.');
			return;
		}
		document.getElementById("cb_display_synthesis").checked = false;
		document.getElementById('panel_prop_sm_synthesis').style.display = "none";

		UI.Statemachine.abortTransition();

		let local_timeout = parseInt(document.getElementById('input_prop_synthesis_timeout').value, 10);
		RC.PubSub.requestSynthesisGoal(
			goal_payload,
			current_prop_state.getStatePath(),
			function(result) {
				clearSynthesisFields();
			},
			function(feedback) {
				UI.Tools.updateSynthesisProgress(feedback.status);
			},
			undefined,
			local_timeout
		);
		UI.Tools.showSynthesisProgress(local_timeout);
	}

	this.DEBUG_renderSynthesisSchema = function(schema_fields, state) {
		current_prop_state = state;
		synthesis_schema_cache = schema_fields;
		renderSynthesisSchema(schema_fields);
	}

	this.DEBUG_buildSynthesisPayload = function(schema_fields, state) {
		current_prop_state = state;
		synthesis_schema_cache = schema_fields;
		return buildSynthesisPayload();
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

}) ();
