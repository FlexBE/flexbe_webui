UI.Dashboard = new (function() {
	var that = this;

	var show_param_edit = false;
	var tab_targets = [];
	var parameter_tab_targets = [];
	var listeners_to_cleanup = [];
	var parameter_flip_focus = undefined;

	//
	//  Private Configuration
	// =======================
	this.removePrivateVariable = function(var_key) {
		let entry = Behavior.getPrivateVariables().findElement(function (el) { return el.key == var_key; });
		let childRow = document.getElementById("db_field_variable_table_row_" + var_key);
		if (entry == undefined || childRow == undefined) {
			console.log(`\x1b[93mPrivateVariable.removePrivateVariable - unknown entry (${entry}) or child row (${childRow}) for '${var_key}'\x1b[0m`);
			return false;
		}
		console.log(`\x1b[93mCalling removePrivateVariable with '${entry.key}': ${entry.value} ...\x1b[0m`);

		Behavior.getPrivateVariables().remove(entry);

		// clear using exact match
		that.clearChildElements("db_field_variable_table_remove_button_" + var_key);
		that.clearChildElements("db_field_variable_table_key_input_" + var_key);
		that.clearChildElements("db_field_variable_table_value_input_" + var_key);
		document.getElementById("db_variable_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
		return true;
	};

	this.changePrivateVariableKeyFunction = async function(new_key, old_key) {
		console.log(`\x1b[92mCalling changePrivateVariableKeyFunction with '${new_key}' from old '${old_key}' (active='${document.activeElement.id}')\x1b[0m`);
		if (new_key == old_key) {
			console.log(`Ignoring changePrivateVariableKeyFunction for '${old_key}' with no change`);
			return false;
		}

		let privateVars = Behavior.getPrivateVariables();
		console.log(`Existing private vars: ${JSON.stringify(privateVars)}`);
		let entry = privateVars.findElement((el) => { return el.key == old_key; });
		let keyElement = document.getElementById('db_field_variable_table_key_input_' + old_key);
		if (entry == undefined || keyElement == undefined) {
			console.log(`\x1b[93mPrivateVariable.changePrivateVariableKey - unknown entry (${entry}) or key element (${keyElement}) for '${old_key}'\x1b[0m`);
			if (keyElement != undefined) keyElement.focus({ preventScroll: true });
			return false;
		}

		let match = privateVars.findElement((el) => {return el.key === new_key && el != entry;});
		if (match != undefined) {
			// - causes recursion error! keyElement.focus({preventScroll: true});  // hold focus here and interrupt the transition
			console.log(`Cannot not use a duplicate key in private variables! ('${new_key}' in '${keyElement.id}')  (active='${document.activeElement.id}')`);
			let ack = await UI.Tools.customAcknowledge("Duplicate keys in private variables are not allowed.<br><br>Select button to continue.")
			console.log(`acknowledged - reset focus to '${keyElement.id}'  (active='${document.activeElement.id}')`);
			keyElement.focus({ preventScroll: true });
			return false;
		}

		// new key is acceptable
		entry.key = new_key;
		keyElement.setAttribute("key", new_key);
		keyElement.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		keyElement.value = new_key;
		keyElement.id = "db_field_variable_table_key_input_" + new_key

		// Update the other element ids with new key value
		let variableRow = document.getElementById("db_field_variable_table_row_" + old_key);
		variableRow.id = "db_field_variable_table_row_" + new_key;
		let removeElement = document.getElementById("db_field_variable_table_remove_button_" + old_key);
		removeElement.id = "db_field_variable_table_remove_button_" + new_key
		let valueElement = document.getElementById("db_field_variable_table_value_input_" + old_key);
		valueElement.id = "db_field_variable_table_value_input_" + new_key;

		console.log(`changed key so add activity tracer for '${new_key}' from '${old_key}'`);
		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Renamed private variable " + old_key + " to " + new_key,
			function() { that.changePrivateVariableKeyFunction(old_key, new_key); },
			function() { that.changePrivateVariableKeyFunction(new_key, old_key); }
		);

		return true;
	};

	this.changePrivateVariableValueFunction = function(new_value, key) {
		let entry = Behavior.getPrivateVariables().findElement(function (el) { return el.key == key; });
		if (entry == undefined) {
			console.log(`Failed to find a valid entry to changeValue for private variable '${key}'`);
			return false;
		}
		let element = document.getElementById('db_field_variable_table_value_input_' + key);
		element.setAttribute("old_value", entry.value);
		element.style.backgroundColor = Checking.setColorByEntryType(new_value);
		element.value = new_value;
		entry.value = new_value;
		console.log(`change '${key}' value to ${new_value}!`);
		return true;
	};

	this._addPrivateVariable = function(new_key, new_value) {
		console.log(`\x1b[93mCalling addPrivateVariable with '${new_key}': ${new_value} ...\x1b[0m`);
		let privateVariables = Behavior.getPrivateVariables();
		let match = privateVariables.find((element) => {return element.key === new_key;});

		if  (match != undefined) {
			T.logError(`Attempted to add duplicate key '${new_key}' to private variables! (fix bad code)`);
			return false;
		}

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_variable_table_remove_button_" + new_key);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this variable");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		remove_button.setAttribute("tabindex", "0");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = key_input_field.getAttribute("key");
			let value = value_input_field.getAttribute("old_value");
			console.log(`\x1b[93m Dashboard remove private variable '${key}' : ${value}\x1b[0m`);
			if (that.removePrivateVariable(key)) {
				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
					"Removed private variable " + key,
					function() { that.addPrivateVariable(key, value); },
					function() { that.removePrivateVariable(key); }
				);
			}
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterRemove button for private variable '${event.target.id}' (active='${document.activeElement.id}')...\x1b[0m`);
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let key_input_field = document.createElement("input");
		key_input_field.setAttribute("id", "db_field_variable_table_key_input_" + new_key);
		key_input_field.setAttribute("value", new_key);
		key_input_field.setAttribute("key", new_key);
		key_input_field.setAttribute("class", "inline_text_edit");
		key_input_field.setAttribute("type", "text");
		key_input_field.setAttribute("tabindex", "0");
		key_input_field.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		const keyInputBlurHandler = async function(event) {
			let old_key = key_input_field.getAttribute("key");
			let new_key = key_input_field.value;
			console.log(`keyInputBlurHandler for private variable ${JSON.stringify(event)} old='${old_key}' new='${new_key}' (${document.activeElement.id})`);
			if (old_key == new_key) return;

			setTimeout(() => {that.changePrivateVariableKeyFunction(new_key, old_key)}, 0);

		};
		key_input_field.addEventListener("blur", keyInputBlurHandler);
		listeners_to_cleanup.push({'element': key_input_field, 'listener_type': 'blur', 'handler': keyInputBlurHandler});

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_variable_table_value_input_" + new_key);
		value_input_field.setAttribute("value", new_value);
		value_input_field.setAttribute("old_value", new_value);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", "text");
		value_input_field.setAttribute("tabindex", "0");
		value_input_field.style.backgroundColor = Checking.setColorByEntryType(new_value);
		const valueInputBlurHandler = function() {
			let key = key_input_field.getAttribute("key");
			let old_value = value_input_field.getAttribute("old_value");
			let new_value = value_input_field.value;
			if (old_value == new_value) return;
			let rc = that.changePrivateVariableValueFunction(new_value, key);
			if (rc) {
				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
					"Changed private variable " + key + " to " + new_value,
					function() { that.changePrivateVariableValueFunction(old_value, key); },
					function() { that.changePrivateVariableValueFunction(new_value, key); }
				);
			} else {
				console.log(`failed to set value for '${key}' in '${value_input_field.id}'`);
			}
		};
		value_input_field.addEventListener("blur", valueInputBlurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': valueInputBlurHandler});

		let td_key_input_field = document.createElement("td");
		let td_label = document.createElement("td");
		let td_value_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_key_input_field.appendChild(key_input_field);
		td_label.innerHTML = "&nbsp;&nbsp;=&nbsp;";
		td_value_input_field.appendChild(value_input_field);
		td_value_input_field.setAttribute("width", "62%");
		td_remove_button.appendChild(remove_button);

		let tr = document.createElement("tr");
		tr.id = "db_field_variable_table_row_" + new_key
		tr.appendChild(td_key_input_field);
		tr.appendChild(td_label);
		tr.appendChild(td_value_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_variable_table").appendChild(tr);
		privateVariables.push({key: new_key, value: new_value});

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_ADD,
			"Added private variable " + new_key + " = " + new_value,
			function() { that.removePrivateVariable(new_key); },
			function() { that.addPrivateVariable(new_key, new_value); }
		);

		tab_targets = that.updateTabTargets("dashboard");
		console.log(`Done with add private variable for '${new_key}'!`);
		return true;
	}

	//
	//  State Machine Userdata
	// ========================

	this._addDefaultUserdata = function(new_key, new_value) {
		let userData = Behavior.getDefaultUserdata();
		let match = userData.find((element) => {
			return element.key === new_key;});

		if  (match != undefined) {
			T.logError(`Added duplicate key '${new_key}' to userdata! (fix bad code)`);
		}

		userData.push({key: new_key, value: new_value});

		let tr = document.createElement("tr");

		const removeFunction = function(var_key) {
			console.log(`Removing _addDefaultUserdata '${var_key}' ...`);
			tr.parentNode.removeChild(tr);
			let element = Behavior.getDefaultUserdata().findElement(function (element) { return element.key == var_key; });
			if (element != undefined) Behavior.getDefaultUserdata().remove(element);
			that.clearChildElements("db_field_userdata_table_remove_button_"+new_key);
			that.clearChildElements("db_field_userdata_table_key_input_"+new_key);
			that.clearChildElements("db_field_userdata_table_value_input_"+new_key);
		};
		const addFunction = function(var_key, var_value) {
			document.getElementById("db_userdata_table").appendChild(tr);
			Behavior.getDefaultUserdata().push({key: var_key, value: var_value});
		};
		const changeKeyFunction = async function(new_key, old_key, element) {
			let userData = Behavior.getDefaultUserdata();
			let entry = userData.findElement(function (el) { return el.key == old_key; });
			if (entry == undefined) {
				console.log(`\x1b[91mFailed to find matching entry for '${old_key}' (ignore '${new_key}')\x1b[0m`);
				return;
			}
			let match = userData.find((element) => {return element.key === new_key && element != entry;});
			if (match != undefined) {
				console.log(`Cannot not use a duplicate key in user data!`);
				let ack = await UI.Tools.customAcknowledge("Duplicate keys in userdata are not allowed.<br><br>Select button to continue.")
				document.getElementById(element.id).focus({ preventScroll: true });
				return;
			}

			// new key is acceptable
			entry.key = new_key;
			element.setAttribute("key", new_key);
			element.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
			element.value = new_key;
		};
		const changeValueFunction = function(new_value, key, element) {
			let entry = Behavior.getDefaultUserdata().findElement(function (el) { return el.key == key; });
			if (entry != undefined) entry.value = new_value;
			element.setAttribute("old_value", new_value);
			element.style.backgroundColor = Checking.setColorByEntryType(new_value);
			element.value = new_value;
		};

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_userdata_table_remove_button_" + new_key);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this userdata");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = key_input_field.getAttribute("key");
			let value = value_input_field.getAttribute("old_value");
			removeFunction(key);

			ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
				"Removed userdata " + key,
				function() { addFunction(key, value); },
				function() { removeFunction(key); }
			);
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterRemove button ...\x1b[0m`);
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let key_input_field = document.createElement("input");
		key_input_field.setAttribute("id", "db_field_userdata_table_key_input_"+new_key);
		key_input_field.setAttribute("value", new_key);
		key_input_field.setAttribute("key", new_key);
		key_input_field.setAttribute("class", "inline_text_edit");
		key_input_field.setAttribute("type", "text");
		key_input_field.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		key_input_field.addEventListener("blur", function() {
			let old_key = key_input_field.getAttribute("key");
			let new_key = key_input_field.value;
			if (old_key == new_key) return;
			changeKeyFunction(new_key, old_key, key_input_field);

			ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
				"Renamed userdata " + old_key + " to " + new_key,
				function() { changeKeyFunction(old_key, new_key, key_input_field); },
				function() { changeKeyFunction(new_key, old_key, key_input_field); }
			);
		});
		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_userdata_table_value_input_"+new_key);
		value_input_field.setAttribute("value", new_value);
		value_input_field.setAttribute("old_value", new_value);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", "text");
		value_input_field.style.backgroundColor = Checking.setColorByEntryType(new_value);
		value_input_field.addEventListener("blur", function() {
			let key = key_input_field.getAttribute("key");
			let old_value = value_input_field.getAttribute("old_value");
			let new_value = value_input_field.value;
			if (old_value == new_value) return;
			changeValueFunction(new_value, key, value_input_field);

			ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
				"Changed userdata " + key + " to " + new_value,
				function() { changeValueFunction(old_value, key, value_input_field); },
				function() { changeValueFunction(new_value, key, value_input_field); }
			);
		});

		let td_key_input_field = document.createElement("td");
		let td_label = document.createElement("td");
		let td_value_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_key_input_field.appendChild(key_input_field);
		td_label.innerHTML = "&nbsp;&nbsp;=&nbsp;";
		td_value_input_field.appendChild(value_input_field);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_key_input_field);
		tr.appendChild(td_label);
		tr.appendChild(td_value_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_userdata_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_ADD,
			"Added userdata " + new_key + " = " + new_value,
			function() { removeFunction(new_key); },
			function() { addFunction(new_key, new_value); }
		);
		tab_targets = that.updateTabTargets("dashboard");
	}

	//
	//  Behavior Parameters
	// ===================

	this._addBehaviorParameter = async function(new_type, new_name) {
		let daa = getDefaultAndAdditional(new_type);

		let existing = Behavior.getBehaviorParameterElement(new_name);
		if (existing != undefined) {
			console.log(`Parameter name '${new_name}' already exists!`);
			let ack = await UI.Tools.customAcknowledge(`Parameter name '${new_name}' already exists!.<br><br>Select button to continue.`)
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			return;
		}
		Behavior.getBehaviorParameters().push({
			type: new_type,
			name: new_name,
			default: daa.default,
			label: new_name,
			hint: "Sets the " + new_name,
			additional: daa.additional
		});

		let edit_button = document.createElement("img");
		edit_button.setAttribute("id", "db_field_parameter_table_edit_button_" + new_name);
		edit_button.setAttribute("src", "img/pencil.png");
		edit_button.setAttribute("title", "Edit this parameter");
		edit_button.setAttribute("class", "img_button");
		edit_button.setAttribute("style", "margin-left: 10px;");
		edit_button.setAttribute("tabindex", "0");
		edit_button.setAttribute("name", new_name);
		const editButtonHandler = function(event) {
			console.log(`parameter edit button handler ${event.type}'`);
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let name = edit_button.getAttribute("name");

			that.createBehaviorParameterEdit(name);

			that.turnParameterClicked(event);
		};
		edit_button.addEventListener("click", editButtonHandler);
		listeners_to_cleanup.push({'element': edit_button, 'listener_type': 'click', 'handler': editButtonHandler});

		const onEnterEdit = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterEdit button ...\x1b[0m`);
				editButtonHandler(event);
			}
		}
		edit_button.addEventListener("keydown", onEnterEdit);
		listeners_to_cleanup.push({'element': edit_button, 'listener_type': 'keydown', 'handler': onEnterEdit});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_parameter_table_remove_button_" + new_name);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this parameter");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		remove_button.setAttribute("tabindex", "0");
		remove_button.setAttribute("name", new_name);
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers

			let name = remove_button.getAttribute("name");

			Behavior.removeBehaviorParameter(name);

			let row = remove_button.parentNode.parentNode;
			row.parentNode.removeChild(row);
			that.clearChildElements("db_field_parameter_table_type_input_" + new_name);
			that.clearChildElements("db_field_parameter_table_name_input_" + new_name);
			that.clearChildElements("db_field_parameter_table_edit_button_" + new_name);
			that.clearChildElements("db_field_parameter_table_remove_button_" + new_name);
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let type_input_field = document.createElement("select");
		type_input_field.innerHTML = '<option value="enum"' + (new_type == "enum"? ' selected="selected"' : '') + '>Enum</option>' +
							'<option value="numeric"' + (new_type == "numeric"? ' selected="selected"' : '') + '>Numeric</option>' +
							'<option value="boolean"' + (new_type == "boolean"? ' selected="selected"' : '') + '>Boolean</option>' +
							'<option value="text"' + (new_type == "text"? ' selected="selected"' : '') + '>Text</option>' +
							'<option value="yaml"' + (new_type == "yaml"? ' selected="selected"' : '') + '>File</option>';
		type_input_field.setAttribute("id", "db_field_parameter_table_type_input_" + new_name);
		type_input_field.setAttribute("name", new_name);
		type_input_field.setAttribute("class", "inline_text_edit");
		const typeBlurHandler = function(event) {
			let name = type_input_field.getAttribute("name");
			let type = type_input_field.options[type_input_field.selectedIndex].value;
			let daa = getDefaultAndAdditional(type);
			Behavior.updateBehaviorParameter(name, type, "type");
			Behavior.updateBehaviorParameter(name, daa.default, "default");
			Behavior.updateBehaviorParameter(name, daa.additional, "additional");
		};
		type_input_field.addEventListener("blur", typeBlurHandler);
		listeners_to_cleanup.push({'element': type_input_field, 'listener_type': 'blur', 'handler': typeBlurHandler});


		let name_input_field = document.createElement("input");
		name_input_field.setAttribute("id", "db_field_edit_parameter_table_name_input_"+new_name);
		name_input_field.setAttribute("value", new_name);
		name_input_field.setAttribute("name", new_name);
		name_input_field.setAttribute("class", "inline_text_edit");
		name_input_field.setAttribute("type", "text");
		const nameBlurHandler = function(event) {
			let name = name_input_field.getAttribute("name"); // prior name
			let entry = Behavior.getBehaviorParameters().findElement(function(element) {
				return element.name == name;
			});

			if (entry != undefined) {
				Behavior.updateBehaviorParameter(name, name_input_field.value, "name");
				// Update existing hint and label if based only on the old name
				if (entry.label == name) Behavior.updateBehaviorParameter(name, name_input_field.value, "label");
				if (entry.hint == "Sets the " + name) Behavior.updateBehaviorParameter(name, "Sets the " + name, "hint");
			}

			name_input_field.setAttribute("name", name_input_field.value);
			name_input_field.parentNode.parentNode.children[0].children[0].setAttribute("name", name_input_field.value);
			name_input_field.parentNode.parentNode.children[2].children[0].setAttribute("name", name_input_field.value);
			name_input_field.parentNode.parentNode.children[3].children[0].setAttribute("name", name_input_field.value);
		};
		name_input_field.addEventListener("blur", nameBlurHandler);
		listeners_to_cleanup.push({'element': name_input_field, 'listener_type': 'blur', 'handler': nameBlurHandler});

		let td_type_input_field = document.createElement("td");
		let td_name_input_field = document.createElement("td");
		let td_edit_button = document.createElement("td");
		let td_remove_button = document.createElement("td");
		let tr = document.createElement("tr");

		td_type_input_field.appendChild(type_input_field);
		td_name_input_field.appendChild(name_input_field);
		td_edit_button.appendChild(edit_button);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_type_input_field);
		tr.appendChild(td_name_input_field); // adapt changes on backside name change event
		tr.appendChild(td_edit_button);
		tr.appendChild(td_remove_button);
		document.getElementById("db_parameter_table").appendChild(tr);
		tab_targets = that.updateTabTargets("dashboard");
	}

	//
	//  Private Functions
	// ===================

	this._addPrivateFunction = function(new_name, new_params) {
		console.log(`Adding  private function '${new_name}'('${new_params}') to behavior `);
		Behavior.getPrivateFunctions().push({name: new_name, params: new_params});

		let name_input_field = document.createElement("input");
		name_input_field.setAttribute("value", new_name);
		name_input_field.setAttribute("name", new_name);
		name_input_field.setAttribute("class", "inline_function_text_readonly");
		name_input_field.setAttribute("type", "text");
		name_input_field.setAttribute("readonly", "readonly");
		name_input_field.setAttribute("tabindex", "-1"); // Makes the input field unable to receive focus

		let params_input_field = document.createElement("input");
		params_input_field.setAttribute("value", new_params != undefined ? new_params : "");
		params_input_field.setAttribute("name", new_name);
		params_input_field.setAttribute("class", "inline_function_text_readonly");
		params_input_field.setAttribute("type", "text");
		params_input_field.setAttribute("readonly", "readonly");
		params_input_field.setAttribute("tabindex", "-1"); // Makes the input field unable to receive focus

		let td_name_input_field = document.createElement("td");
		let td_parentheses_left = document.createElement("td");
		let td_params_input_field = document.createElement("td");
		let td_parentheses_right = document.createElement("td");
		let tr = document.createElement("tr");
		tr.setAttribute("id", new_name);

		td_name_input_field.appendChild(name_input_field);
		td_parentheses_left.innerHTML = "&nbsp;&nbsp;(";
		td_params_input_field.appendChild(params_input_field);
		td_parentheses_right.innerHTML = "&nbsp;)";
		tr.appendChild(td_name_input_field);
		tr.appendChild(td_parentheses_left);
		tr.appendChild(td_params_input_field);
		tr.appendChild(td_parentheses_right);
		document.getElementById("db_function_table").appendChild(tr);
	}

	this.editBoxClicked = function(headerText, getTextFunc, acceptFunc, discardFunc) {
		let modal = document.getElementById("db_function_edit_modal");
		let modalTextArea = document.getElementById("db_function_edit_modal_text");
		let modalOverlay = document.getElementById("db_function_edit_modal_text_overlay");
		let acceptButton = document.getElementById("db_function_accept_button");
		let discardButton = document.getElementById("db_function_discard_button");

		modal.style.display = "block";
		modalTextArea.value = getTextFunc();
		db_function_edit_modal_header.textContent = headerText;
		let overlayNeedsUpdate = true;
		function updateOverlay() {
			if (overlayNeedsUpdate) {
				let formattedText = modalTextArea.value
					.replace(/ /g, '·')   // Replace spaces with middle dot
					.replace(/\t/g, '→\t'); // Replace tabs with arrow
				modalOverlay.textContent = formattedText;
				// Correct any discrepancies when scroll reaches the bottom
				if (modalTextArea.scrollTop + modalOverlay.clientHeight > modalOverlay.scrollHeight) {
					modalTextArea.scrollTop = modalTextArea.scrollHeight - modalTextArea.clientHeight - (modalTextArea.scrollHeight - modalOverlay.scrollHeight);
					modalOverlay.scrollTop = modalOverlay.scrollHeight - modalOverlay.clientHeight ;
				} else {
					modalOverlay.scrollTop = modalTextArea.scrollTop;
				}

				// Correct any discrepancies when scroll reaches the right edge
				if (modalTextArea.scrollLeft + modalOverlay.clientWidth > modalOverlay.scrollWidth) {
					modalTextArea.scrollLeft = modalTextArea.scrollWidth - modalTextArea.clientWidth - (modalTextArea.scrollWidth - modalOverlay.scrollWidth);
					modalOverlay.scrollLeft = modalOverlay.scrollWidth - modalOverlay.clientWidth ;
				} else {
					modalOverlay.scrollLeft = modalTextArea.scrollLeft;
				}
				overlayNeedsUpdate = false;
			}
			window.requestAnimationFrame(updateOverlay);
		}

		// Set up listeners to handle changes
		modalTextArea.addEventListener("input", function() {
			overlayNeedsUpdate = true;
		});

		modalTextArea.addEventListener('scroll', () => {
			overlayNeedsUpdate = true;
		});

		// Initial sync up with current data
		updateOverlay();

		function clearModal() {
			acceptButton.onclick = null;
			discardButton.onclick = null;
			acceptButton.onkeydown = null;
			discardButton.onkeydown = null;
			modal.style.display = "none";
			updateOverlay(modalTextArea, modalOverlay);
		}

		function handleAccept(event) {
			event.stopPropagation();
			event.preventDefault();

			console.log(`handleAccept:\n${modalTextArea.value}`);
			acceptFunc(modalTextArea.value.trimEnd());

			clearModal();
		}

		function handleDiscard(event) {
			event.stopPropagation();
			event.preventDefault();

			modalTextArea.value = discardFunc();

			clearModal();
		}

		acceptButton.onclick = handleAccept;
		discardButton.onclick = handleDiscard;
		acceptButton.onkeydown = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				handleAccept(event);
			}  else if (event.key === 'Tab') {
				event.stopPropagation();
				event.preventDefault();
				modalTextArea.focus({ preventScroll: true });
			}
		}

		discardButton.onkeydown = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				handleDiscard(event);
			} else if (event.key === 'Tab') {
				event.stopPropagation();
				event.preventDefault();
				acceptButton.focus({ preventScroll: true });
			}
		}

		modal.onkeydown = function(event) {
			if (event.key === 'Tab') {
				console.log(`\x1b[93m modal edit tab '${event.target.id}' '${document.activeElement.id}' \x1b[0m`);
				event.stopPropagation();
				event.preventDefault();

				if (document.activeElement.id === modalTextArea.id) {
					if (event.shiftKey) {
						// Use shift to change focus from text box
						discardButton.focus({ preventScroll: true});
					} else {
						// Insert tab into text box
						const start = modalTextArea.selectionStart;
						const end = modalTextArea.selectionEnd;
						const whiteSpace = UI.Settings.getCodeIndentation();
						console.log(` Handling TAB in edit box: ${start} ${end} ${modalTextArea.length} '${whiteSpace}'`);
						// Set textarea value to: text before caret + tab + text after caret
						modalTextArea.value = modalTextArea.value.substring(0, start) + whiteSpace + modalTextArea.value.substring(end);

						// Put caret at right position again
						modalTextArea.selectionStart = modalTextArea.selectionEnd = start + whiteSpace.length;
					}
				} else {
					modalTextArea.focus({ preventScroll: true});
				}
			} else if (event.ctrlKey && (event.key.toLowerCase() === 's')
						&& document.activeElement.id === modalTextArea.id) {
				console.log(`\x1b[93m Save request from ctrl-S from '${event.target.id}' '${document.activeElement.id}' \x1b[0m`);
				handleAccept(event);
			} else {
				event.stopPropagation(); // but allow default behavior for text edit
			}
		}
		discardButton.focus({preventScroll: true}); // move focus to discard button by default
	}

	this.setPrivateFunctionText = function(textValue) {
		console.log(`\x1b[93mPrivate Function:\n${textValue}\x1b[0m`);
		let func_defs = [];
		if (textValue != "") {
			let func_result = textValue;
			let function_def_pattern = /^\s*def (\w+)\(self(?:, ([^)]+))?\):$/img;
			func_result.replace(function_def_pattern, function(all, name, params) {
				func_defs.push({key: name, value: params});
			});
			if (func_defs.length === 0) {
				if (textValue.contains('def ') && textValue.contains('self')) {
					T.logError("No valid private functions found - check your code!");
				} else {
					T.logError("Private functions should fit pattern 'def *(self*' in definition!");
				}
			}
		}
		console.log(`\x1b[93mAccepting ${func_defs.length} manual functions!\x1b[0m`);

		Behavior.getPrivateFunctions().length = 0; // clear existing list
		document.getElementById('db_function_table').innerHTML = "";
		Behavior.setManualCodeFunc(textValue);
		if (func_defs.length > 0) {
			// Update the function list
			func_defs.forEach(function(element, i) {
				UI.Dashboard.addPrivateFunction(element.key, element.value); // also updates Behavior.private_functions
			});
		}
	}

	this.editPrivateFunctionClicked = function(event) {
			event.stopPropagation();
			event.preventDefault();

			function acceptFunction(textValue) {
				// Extract the function signatures
				let priorText = Behavior.getManualCodeFunc().trimEnd();
				if (priorText === textValue) {
					console.log(`No change in private function text.`);
					return;
				}

				that.setPrivateFunctionText(textValue);
				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
					"Update private function code",
					function() { that.setPrivateFunctionText(priorText);},
					function() { that.setPrivateFunctionText(textValue); }
				);
			}

			function discardFunction() {
				return "";
			}

			that.editBoxClicked("Private Functions", Behavior.getManualCodeFunc, acceptFunction, discardFunction);
	}

	this.editManualInitClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();

		function acceptFunction(textValue) {
			console.log(`\x1b[93mAccepting manual init block!\x1b[0m`);
			let priorText = Behavior.getManualCodeInit().trimEnd();
			if (priorText != textValue) {
				Behavior.setManualCodeInit(textValue);
				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
					"Update manual initialization code",
					function() { Behavior.setManualCodeInit(priorText); },
					function() { Behavior.setManualCodeInit(textValue); }
				);
			}
		}

		function discardFunction() {
			console.log(`\x1b[93mDiscarding changes to manual init block!\x1b[0m`);
			return "";
		}

		that.editBoxClicked("Manual Initialization Block", Behavior.getManualCodeInit, acceptFunction, discardFunction);

	}


	this.editManualCreateClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();

		function acceptFunction(textValue) {
			let priorText = Behavior.getManualCodeCreate().trimEnd();
			if (priorText != textValue) {
				console.log(`\x1b[93mAccepting manual create block!\x1b[0m`);
				Behavior.setManualCodeCreate(textValue);
				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
					"Update manual create code",
					function() { Behavior.setManualCodeCreate(priorText);},
					function() { Behavior.setManualCodeCreate(textValue); }
				);
			}
		}

		function discardFunction() {
			console.log(`\x1b[93mDiscarding changes to manual create block!\x1b[0m`);
			return "";
		}

		that.editBoxClicked("Manual Creation Block", Behavior.getManualCodeCreate, acceptFunction, discardFunction);

	}

	//
	//	State Machine Interface
	// =========================

	this._addBehaviorOutcome = function(new_outcome) {
		Behavior.addInterfaceOutcome(new_outcome);

		let tr = document.createElement("tr");

		const removeFunction = function(outcome) {
			console.log(`Removing _addBehaviorOutcome '${outcome}' ...`);
			tr.parentNode.removeChild(tr);
			Behavior.removeInterfaceOutcome(outcome);
			if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
			that.clearChildElements("db_field_outcome_table_remove_button_"+new_outcome);
			that.clearChildElements("db_field_outcome_table_input_field_"+new_outcome);
		};
		const addFunction = function(outcome) {
			document.getElementById("db_outcome_table").appendChild(tr);
			Behavior.addInterfaceOutcome(outcome);
			if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
		};

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_outcome_table_remove_button_" + new_outcome);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from outcomes");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		remove_button.setAttribute("tabindex", "0");

		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let outcome = input_field.getAttribute("old_value");
			removeFunction(outcome);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Removed behavior outcome " + outcome,
				function() { addFunction(outcome); },
				function() { removeFunction(outcome); }
			);
		};

		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterRemove button ...\x1b[0m`);
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_outcome_table_input_field_"+new_outcome);
		input_field.setAttribute("value", new_outcome);
		input_field.setAttribute("old_value", new_outcome);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");
		input_field.addEventListener("blur", function() {
			let new_value = input_field.value;
			let old_value = input_field.getAttribute("old_value");
			if (old_value === new_value) return;

			Behavior.updateInterfaceOutcome(old_value, new_value);
			input_field.setAttribute("old_value", new_value);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Renamed behavior outcome " + old_value + " to " + new_value,
				function() {
					Behavior.updateInterfaceOutcome(new_value, old_value);
					input_field.setAttribute("old_value", old_value);
					input_field.value = old_value;
					if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
				},
				function() {
					Behavior.updateInterfaceOutcome(old_value, new_value);
					input_field.setAttribute("old_value", new_value);
					input_field.value = new_value;
					if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
				}
			);
		});

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_outcome_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior outcome " + new_outcome,
			function() { removeFunction(new_outcome); },
			function() { addFunction(new_outcome); }
		);
		tab_targets = that.updateTabTargets("dashboard");
	}

	this._addBehaviorInputKey = function(new_key) {
		Behavior.addInterfaceInputKey(new_key);

		let tr = document.createElement("tr");

		const removeFunction = function(key) {
			console.log(`Removing _addBehaviorInputKey '${key}' ...`);
			tr.parentNode.removeChild(tr);
			Behavior.removeInterfaceInputKey(key);
			that.clearChildElements("db_field_input_key_table_remove_button_" + new_key);
			that.clearChildElements("db_field_input_key_table_input_field_" + new_key);
		};
		const addFunction = function(key) {
			document.getElementById("db_input_key_table").appendChild(tr);
			Behavior.addInterfaceInputKey(key);
		};

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_input_key_table_remove_button_" + new_key);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from input keys");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = input_field.getAttribute("old_value");
			removeFunction(key);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Removed behavior input key " + key,
				function() { addFunction(key); },
				function() { removeFunction(key); }
			);
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterRemove button ...\x1b[0m`);
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_input_key_table_input_field_"+new_key);
		input_field.setAttribute("value", new_key);
		input_field.setAttribute("old_value", new_key);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");
		input_field.addEventListener("blur", function() {
			let new_value = input_field.value;
			let old_value = input_field.getAttribute("old_value");
			if (new_value === old_value) return;

			Behavior.updateInterfaceInputKeys(old_value, new_value);
			input_field.setAttribute("old_value", new_value);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Renamed behavior input key " + old_value + " to " + new_value,
				function() {
					Behavior.updateInterfaceInputKeys(new_value, old_value);
					input_field.setAttribute("old_value", old_value);
					input_field.value = old_value;
				},
				function() {
					Behavior.updateInterfaceInputKeys(old_value, new_value);
					input_field.setAttribute("old_value", new_value);
					input_field.value = new_value;
				}
			);
		});

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_input_key_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior input key " + new_key,
			function() { removeFunction(new_key); },
			function() { addFunction(new_key); }
		);
		tab_targets = that.updateTabTargets("dashboard");
	}

	this._addBehaviorOutputKey = function(new_key) {
		Behavior.addInterfaceOutputKey(new_key);

		let tr = document.createElement("tr");

		const removeFunction = function(key) {
			console.log(`Removing _addBehaviorOutputKey '${key}' ...`);
			tr.parentNode.removeChild(tr);
			Behavior.removeInterfaceOutputKey(key);
			if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
			that.clearChildElements("db_field_output_key_table_remove_button_" + new_key);
			that.clearChildElements("db_field_output_key_table_input_field_" + new_key);
		};
		const addFunction = function(key) {
			document.getElementById("db_output_key_table").appendChild(tr);
			Behavior.addInterfaceOutputKey(key);
			if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
		};

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_output_key_table_remove_button_" + new_key);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from output keys");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");

		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = input_field.getAttribute("old_value");
			removeFunction(key);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Removed behavior output key " + key,
				function() { addFunction(key); },
				function() { removeFunction(key); }
			);
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				console.log(`\x1b[94monEnterRemove button ...\x1b[0m`);
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_output_key_table_input_field_"+new_key);
		input_field.setAttribute("value", new_key);
		input_field.setAttribute("old_value", new_key);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");
		input_field.addEventListener("blur", function() {
			let new_value = input_field.value;
			let old_value = input_field.getAttribute("old_value");
			if (new_value === old_value) return;

			Behavior.updateInterfaceOutputKeys(old_value, new_value);
			input_field.setAttribute("old_value", new_value);

			ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
				"Renamed behavior output key " + old_value + " to " + new_value,
				function() {
					Behavior.updateInterfaceOutputKeys(new_value, old_value);
					input_field.setAttribute("old_value", old_value);
					input_field.value = old_value;
					if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
				},
				function() {
					Behavior.updateInterfaceOutputKeys(old_value, new_value);
					input_field.setAttribute("old_value", new_value);
					input_field.value = new_value;
					if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
				}
			);
		});

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_output_key_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior output key " + new_key,
			function() { removeFunction(new_key); },
			function() { addFunction(new_key); }
		);
		tab_targets = that.updateTabTargets("dashboard");
	}

	this.createBehaviorParameterEdit = function(param_name) {
		console.log(`createBehaviorParameterEdit for '${param_name}' ...`);
		let param = Behavior.getBehaviorParameters().findElement(function(element) {
			return element.name == param_name;
		});

		let turn_button = document.getElementById('db_parameter_edit_table_turn_button');
		turn_button.addEventListener('click', UI.Dashboard.turnParameterClicked);
		listeners_to_cleanup.push({'element': turn_button, 'listener_type': 'click', 'handler': UI.Dashboard.turnParameterClicked});

		const turnHandler = function(event) {
			if (event.key === "Enter" || event.key === ' ') {
				console.log(`turnHandler enter/space select ...`);
				UI.Dashboard.turnParameterClicked(event);
			}
		};
		turn_button.addEventListener("keydown", turnHandler);
		listeners_to_cleanup.push({'element': turn_button, 'listener_type': 'keydown', 'handler': turnHandler});

		let type_input_field = document.createElement("select");
		type_input_field.innerHTML = '<option value="enum"' + (param.type == "enum"? ' selected="selected"' : '') + '>Enum</option>' +
							'<option value="numeric"' + (param.type == "numeric"? ' selected="selected"' : '') + '>Numeric</option>' +
							'<option value="boolean"' + (param.type == "boolean"? ' selected="selected"' : '') + '>Boolean</option>' +
							'<option value="text"' + (param.type == "text"? ' selected="selected"' : '') + '>Text</option>' +
							'<option value="yaml"' + (param.type == "yaml"? ' selected="selected"' : '') + '>File</option>';
		type_input_field.setAttribute("id", "db_field_parameter_edit_table_type_input");
		type_input_field.setAttribute("name", param_name);
		type_input_field.setAttribute("class", "input_field");
		const changeHandler = function(event) {
			let name = type_input_field.getAttribute("name");
			let type = type_input_field.options[type_input_field.selectedIndex].value;
			let daa = getDefaultAndAdditional(type);
			Behavior.updateBehaviorParameter(name, type, "type");
			Behavior.updateBehaviorParameter(name, daa.default, "default");
			Behavior.updateBehaviorParameter(name, daa.additional, "additional");

			// update input fields
			console.log(`\x1b[93mcreateBehaviorParameterEdit changeHandler for '${param_name}' - parent^3='${type_input_field.parentNode.parentNode.parentNode.id}'\x1b[0m`);
			type_input_field.parentNode.parentNode.parentNode.children[3].children[2].children[0].value = daa.default;

			let param_trs = document.getElementById("db_parameter_table").children;
			for (let i = 0; i < param_trs.length; i++) {
				let param_type_input = param_trs[i].children[0].children[0];
				if (param_type_input.name == name) {
					param_type_input.innerHTML = type_input_field.innerHTML.replace(' selected="selected"', '');
					for (let i = 0; i < param_type_input.children.length; i++) {
						let opt = param_type_input.children[i];
						if (opt.value == type) {
							opt.setAttribute("selected", "selected");
							break;
						}
					}
					break;
				}
			}

			let additional_td = type_input_field.parentNode.parentNode.parentNode.children[5].children[0];
			additional_td.innerHTML = "";
			additional_td.appendChild(that.createParameterAdditionalEdit(name));
		};
		type_input_field.addEventListener("change", changeHandler);
		listeners_to_cleanup.push({'element': type_input_field, 'listener_type': 'change', 'handler': changeHandler});

		let label_label = document.createElement("label");
		label_label.innerHTML = "Label: ";
		let label_input_field = document.createElement("input");
		label_input_field.setAttribute("id", "db_field_parameter_edit_table_label_input");
		label_input_field.setAttribute("value", param.label);
		label_input_field.setAttribute("name", param_name);
		label_input_field.setAttribute("class", "input_field");
		label_input_field.setAttribute("type", "text");
		const labelBlurHandler = function(event) {
			let name = label_input_field.getAttribute("name");
			console.log(`Setting  parameter label for '${name}' to '${label_input_field.value}' ...`);
			Behavior.updateBehaviorParameter(name, label_input_field.value, "label");
		};
		label_input_field.addEventListener("blur", labelBlurHandler);
		listeners_to_cleanup.push({'element': label_input_field, 'listener_type': 'blur', 'handler': labelBlurHandler});

		let hint_label = document.createElement("label");
		hint_label.innerHTML = "Advice for the operator: ";
		let hint_input_field = document.createElement("input");
		hint_input_field.setAttribute("id", "db_field_parameter_edit_table_hint_input");
		hint_input_field.setAttribute("value", param.hint);
		hint_input_field.setAttribute("name", param_name);
		hint_input_field.setAttribute("class", "input_field");
		hint_input_field.setAttribute("type", "text");
		const hintBlurHandler = function(event) {
			let name = hint_input_field.getAttribute("name");
			Behavior.updateBehaviorParameter(name, hint_input_field.value, "hint");
		};
		hint_input_field.addEventListener("blur", hintBlurHandler);
		listeners_to_cleanup.push({'element': hint_input_field, 'listener_type': 'blur', 'handler': hintBlurHandler});

		let name_input_field = document.createElement("input");
		name_input_field.setAttribute("id", "db_field_parameter_edit_table_name_input");
		name_input_field.setAttribute("value", param_name);
		name_input_field.setAttribute("name", param_name);
		name_input_field.setAttribute("class", "inline_text_edit");
		name_input_field.setAttribute("type", "text");
		const nameBlurHandler = function(event) {
			let name = name_input_field.getAttribute("name");
			let entry = Behavior.getBehaviorParameters().findElement(function(element) {
				return element.name == name;
			});

			name_input_field.setAttribute("name", name_input_field.value);
			name_input_field.parentNode.parentNode.children[2].children[0].setAttribute("name", name_input_field.value);

			name_input_field.parentNode.parentNode.parentNode.children[0].children[0].children[0].setAttribute("name", name_input_field.value);
			name_input_field.parentNode.parentNode.parentNode.children[0].children[2].children[0].setAttribute("name", name_input_field.value);

			name_input_field.parentNode.parentNode.parentNode.children[1].children[1].children[0].setAttribute("name", name_input_field.value);

			Behavior.updateBehaviorParameter(name, name_input_field.value, "name");
			// add renaming of label and hint
			if (entry.label == name) {
				Behavior.updateBehaviorParameter(name, name_input_field.value, "label");
				name_input_field.parentNode.parentNode.parentNode.children[0].children[2].children[0].value = name_input_field.value;
			}
			if (entry.hint == "Sets the " + name) {
				Behavior.updateBehaviorParameter(name_input_field.value, "Sets the " + name_input_field.value, "hint");
				name_input_field.parentNode.parentNode.parentNode.children[1].children[1].children[0].value = "Sets the " + name_input_field.value;
			}

			let param_trs = document.getElementById("db_parameter_table").children;
			for (let i = 0; i < param_trs.length; i++) {
				let param_name_input = param_trs[i].children[1].children[0];
				if (param_name_input.name == name) {
					param_name_input.value = name_input_field.value;
					param_name_input.focus({ preventScroll: true });
					param_name_input.blur();
					break;
				}
			}
		};
		name_input_field.addEventListener("blur", nameBlurHandler);
		listeners_to_cleanup.push({'element': hint_input_field, 'listener_type': 'blur', 'handler': nameBlurHandler});

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_parameter_edit_table_value_input");
		value_input_field.setAttribute("value", param.default);
		value_input_field.setAttribute("name", param_name);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", param.type);
		switch (param.type){
			case "text":
				value_input_field.style.backgroundColor = "#7CFC00"; // lawn green for text
				break;
			case "enum":
				value_input_field.style.backgroundColor = "#F08080"; // light coral for enum
				break;
			default:
				value_input_field.style.backgroundColor = "#FFEBCD"; // blanched almond for primitives
		}

		const valueBlurHandler = function(event) {
			let name = value_input_field.getAttribute("name");
			let entry = Behavior.getBehaviorParameters().findElement(function(element) {
				return element.name == name;
			});
			let entry_value = value_input_field.value;
			value_input_field.style.backgroundColor = "#FFEBCD"; // blanched almond for primitives

			if (entry.type == "boolean") {
				if (value_input_field.value.match(/^(true|false)$/i) == undefined) {
					value_input_field.value = entry.default;
				}
			} else if (entry.type == "numeric") {
				if (value_input_field.value.match(/^-?[0-9]+(\.[0-9]+)?$/i) == undefined) {
					value_input_field.value = entry.default;
				}
				if (parseFloat(value_input_field.value) < parseFloat(entry.additional.min)) {
					value_input_field.value = entry.additional.min;
				}
				if (parseFloat(value_input_field.value) > parseFloat(entry.additional.max)) {
					value_input_field.value = entry.additional.max;
				}
			} else if (entry.type == "enum") {
				if (!param.additional.contains(value_input_field.value)) {
					value_input_field.value = entry.default;
				}
				value_input_field.style.backgroundColor = "#D5C5C"; // light coral for enum
			} else if (entry.type == "text") {
				value_input_field.value = value_input_field.value.replace(/^['"]+|['"]+$/g, '');
				if (value_input_field.value != entry_value){
					console.log(`stripped quote marks from parameter value ${name} value='${value_input_field.value}'`);
				}
				value_input_field.style.backgroundColor = "#7CFC00"; // lawn green for text
			} else {
				value_input_field.style.backgroundColor = "#FF4500"; // orange red
			}
			Behavior.updateBehaviorParameter(name, value_input_field.value, "default");
		};
		value_input_field.addEventListener("blur", valueBlurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': valueBlurHandler});

		document.getElementById("db_parameter_edit_table").innerHTML = "";
		let type_td = document.createElement("td");
		let label_td = document.createElement("td");
		let label_input_td = document.createElement("td");
		let hint_td = document.createElement("td");
		let hint_input_td = document.createElement("td");
		hint_input_td.setAttribute("colspan", "2");
		let name_td = document.createElement("td");
		let eq_td = document.createElement("td");
		let value_td = document.createElement("td");
		let add_td = document.createElement("td");
		add_td.setAttribute("colspan", "3");

		type_td.appendChild(type_input_field);
		label_td.appendChild(label_label);
		label_input_td.appendChild(label_input_field);
		name_td.appendChild(name_input_field);
		eq_td.innerHTML = "&nbsp;&nbsp;=&nbsp;";
		eq_td.setAttribute("style", "text-align: center");
		value_td.appendChild(value_input_field);
		hint_td.appendChild(hint_label);
		hint_input_td.appendChild(hint_input_field);
		add_td.appendChild(that.createParameterAdditionalEdit(param_name));

		let top_tr = document.createElement("tr");
		let mid_tr = document.createElement("tr");
		let sep_above_tr = document.createElement("tr");
		sep_above_tr.setAttribute("style", "height: 10px");
		let bot_tr = document.createElement("tr");
		let sep_below_tr = document.createElement("tr");
		sep_below_tr.setAttribute("style", "height: 10px");
		let add_tr = document.createElement("tr");

		top_tr.appendChild(type_td);
		top_tr.appendChild(label_td);
		top_tr.appendChild(label_input_td);
		mid_tr.appendChild(hint_td);
		mid_tr.appendChild(hint_input_td);
		bot_tr.appendChild(name_td);
		bot_tr.appendChild(eq_td);
		bot_tr.appendChild(value_td); // adapt changes on additional param events
		add_tr.appendChild(add_td);

		document.getElementById("db_parameter_edit_table").appendChild(top_tr);
		document.getElementById("db_parameter_edit_table").appendChild(mid_tr);
		document.getElementById("db_parameter_edit_table").appendChild(sep_above_tr);
		document.getElementById("db_parameter_edit_table").appendChild(bot_tr);
		document.getElementById("db_parameter_edit_table").appendChild(sep_below_tr);
		document.getElementById("db_parameter_edit_table").appendChild(add_tr);
		parameter_tab_targets = that.updateTabTargets("db_parameter_edit_table");
		parameter_tab_targets.unshift(document.getElementById("db_parameter_edit_table_turn_button")); // first item
	}

	this.createParameterAdditionalEdit = function(param_name) {
		console.log(`createParameterAdditionalEdit '${param_name}'`);
		let param = Behavior.getBehaviorParameters().findElement(function(element) {
			return element.name == param_name;
		});
		let type = param.type;

		let tr = document.createElement("tr");

		if (type == "enum") {
			let add_input = document.createElement("input");
			add_input.setAttribute("id", "db_field_parameter_edit_table_add_input_"+param_name);
			add_input.setAttribute("class", "input_field");
			add_input.setAttribute("type", "text");
			add_input.setAttribute("tabindex", "0");

			let add_button = document.createElement("input");
			add_button.setAttribute("id", "db_field_parameter_edit_table_add_button_"+param_name);
			add_button.setAttribute("value", "Add");
			add_button.setAttribute("name", param_name);
			add_button.setAttribute("type", "button");
			add_button.setAttribute("tabindex", "0");

			add_button.addEventListener("click", function() {
				let name = add_button.getAttribute("name");
				let to_add = add_button.parentNode.parentNode.children[1].children[0].value;
				add_button.parentNode.parentNode.children[1].children[0].value = "";
				let additional = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				}).additional;
				if (additional.indexOf(to_add) != -1 || to_add == "") return;
				additional.push(to_add);
				Behavior.updateBehaviorParameter(name, additional, "additional");

				// update remove list
				let select = add_button.parentNode.parentNode.children[4].children[0];
				select.innerHTML = '';
				for (let i = 0; i < additional.length; i++) {
					select.innerHTML += '<option value="' + additional[i] + '">' + additional[i] + '</option>';
				};

				// update default value
				let default_field = add_button.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (additional.length == 1) {
					default_field.value = to_add;
					Behavior.updateBehaviorParameter(name, to_add, "default");
				}
			});

			let remove_input = document.createElement("select");
			remove_input.innerHTML = '';
			for (let i = 0; i < param.additional.length; i++) {
				remove_input.innerHTML += '<option value="' + param.additional[i] + '">' + param.additional[i] + '</option>';
			};
			remove_input.setAttribute("id", "db_field_parameter_edit_table_remove_input_" + param_name);
			remove_input.setAttribute("class", "input_field");
			remove_input.setAttribute("style", "min-width: 80px");
			remove_input.setAttribute("type", "text");
			remove_input.setAttribute("tabindex", "0");

			let remove_button = document.createElement("input");
			remove_button.setAttribute("id", "db_field_parameter_edit_table_remove_button_" + param_name);
			remove_button.setAttribute("value", "Remove");
			remove_button.setAttribute("name", param_name);
			remove_button.setAttribute("type", "button");
			remove_button.setAttribute("tabindex", "0");
			const removeHandler =  function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				let name = remove_button.getAttribute("name");

				let select = remove_button.parentNode.parentNode.children[4].children[0];
				let to_remove = select.options[select.selectedIndex].value;
				if (to_remove == "") return;
				let additional = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				}).additional;
				additional.remove(to_remove);
				Behavior.updateBehaviorParameter(name, additional, "additional");

				// update remove list
				select.innerHTML = '';
				for (let i = 0; i < additional.length; i++) {
					select.innerHTML += '<option value="' + additional[i] + '">' + additional[i] + '</option>';
				};

				// update default value
				let default_field = remove_button.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (additional.length == 0) {
					default_field.value = "";
					Behavior.updateBehaviorParameter(name, "", "default");
				} else if (to_remove == default_field.value) {
					default_field.value = additional[0];
					Behavior.updateBehaviorParameter(name, additional[0], "default");
				}

				that.clearChildElements("db_field_parameter_edit_table_", false);
			};
			remove_button.addEventListener("click", removeHandler);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

			const onEnterRemove = function(event) {
				if (event.key === 'Enter' || event.key === ' ') {
					removeHandler(event);
				}
			}
			remove_button.addEventListener("keydown", onEnterRemove);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

			let label_td = document.createElement("td");
			label_td.innerHTML = "Options:&nbsp;&nbsp;&nbsp;";
			let add_input_td = document.createElement("td");
			add_input_td.appendChild(add_input);
			let add_button_td = document.createElement("td");
			add_button_td.appendChild(add_button);
			let spacer_td = document.createElement("td");
			spacer_td.innerHTML = "&nbsp;&nbsp;&nbsp;";
			let remove_input_td = document.createElement("td");
			remove_input_td.appendChild(remove_input);
			let remove_button_td = document.createElement("td");
			remove_button_td.appendChild(remove_button);

			tr.appendChild(label_td);
			tr.appendChild(add_input_td);
			tr.appendChild(add_button_td);
			tr.appendChild(spacer_td);
			tr.appendChild(remove_input_td);
			tr.appendChild(remove_button_td);
		} else if (type == "numeric") {
			let min_input = document.createElement("input");
			min_input.setAttribute("id", "db_field_parameter_edit_table_min_input_"+param_name);
			min_input.setAttribute("value", param.additional.min);
			min_input.setAttribute("name", param_name);
			min_input.setAttribute("class", "input_field");
			min_input.setAttribute("type", "text");
			min_input.setAttribute("tabindex", "0");
			min_input.addEventListener("blur", function() {
				if (min_input.value.match(/^-?[0-9]+(\.[0-9]+)?$/i) == undefined) return;
				let name = min_input.getAttribute("name");
				let additional = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				}).additional;
				if (parseFloat(min_input.value) > parseFloat(additional.max)) min_input.value = additional.max;
				additional.min = min_input.value;
				Behavior.updateBehaviorParameter(name, additional, "additional");

				// update default value
				let default_field = min_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (parseFloat(default_field.value) < parseFloat(min_input.value)) {
					default_field.value = min_input.value;
					Behavior.updateBehaviorParameter(name, min_input.value, "default");
				}
			});
			let max_input = document.createElement("input");
			max_input.setAttribute("id", "db_field_parameter_edit_table_max_input_"+param_name);
			max_input.setAttribute("value", param.additional.max);
			max_input.setAttribute("name", param_name);
			max_input.setAttribute("class", "input_field");
			max_input.setAttribute("type", "text");
			max_input.setAttribute("tabindex", "0");
			max_input.addEventListener("blur", function() {
				if (max_input.value.match(/^-?[0-9]+(\.[0-9]+)?$/i) == undefined) return;
				let name = max_input.getAttribute("name");
				let additional = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				}).additional;
				if (parseFloat(max_input.value) < parseFloat(additional.min)) max_input.value = additional.min;
				additional.max = max_input.value;
				Behavior.updateBehaviorParameter(name, additional, "additional");

				// update default value
				let default_field = max_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (parseFloat(default_field.value) > parseFloat(max_input.value)) {
					default_field.value = max_input.value;
					Behavior.updateBehaviorParameter(name, max_input.value, "default");
				}
			});

			let min_label_td = document.createElement("td");
			min_label_td.innerHTML = "Minimum:&nbsp;&nbsp;&nbsp;";
			let min_input_td = document.createElement("td");
			min_input_td.appendChild(min_input);
			let max_label_td = document.createElement("td");
			max_label_td.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Maximum:&nbsp;&nbsp;&nbsp;";
			let max_input_td = document.createElement("td");
			max_input_td.appendChild(max_input);

			tr.appendChild(min_label_td);
			tr.appendChild(min_input_td);
			tr.appendChild(max_label_td);
			tr.appendChild(max_input_td);
		} else if (type == "yaml") {
			let key_input = document.createElement("input");
			key_input.setAttribute("id", "db_field_parameter_edit_table_key_input_"+param_name);
			key_input.setAttribute("value", param.additional.key);
			key_input.setAttribute("name", param_name);
			key_input.setAttribute("class", "input_field");
			key_input.setAttribute("type", "text");
			key_input.setAttribute("tabindex", "0");
			key_input.addEventListener("blur", function() {
				let name = key_input.getAttribute("name");
				let additional = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				}).additional;
				additional.key = key_input.value;
				Behavior.updateBehaviorParameter(name, additional, "additional");
			});

			let key_label_td = document.createElement("td");
			key_label_td.innerHTML = "Key to look up in file:&nbsp;&nbsp;&nbsp;";
			let key_input_td = document.createElement("td");
			key_input_td.appendChild(key_input);

			tr.appendChild(key_label_td);
			tr.appendChild(key_input_td);
		}

		let table = document.createElement("table");
		table.appendChild(tr);

		return table;
	}

	const getDefaultAndAdditional = function(type) {
		let default_value = "";
		let additional = undefined;
		if (type == "numeric") {
			default_value = "0";
			additional = {min: 0, max: 1};
		} else if (type == "boolean") {
			default_value = "False";
		} else if (type == "yaml") {
			additional = {key: ''};
		} else if (type == "enum") {
			additional = [];
		}
		return {default: default_value, additional: additional};
	}


	//
	//  Interface
	// ===========

	this.setReadonly = function() {
		document.getElementById('db_readonly_overlay').style.display = 'block';
	}

	this.unsetReadonly = function() {
		document.getElementById('db_readonly_overlay').style.display = 'none';
	}

	this.behaviorNameChanged = function() {
		let old_name = Behavior.getBehaviorName();
		let new_name = document.getElementById('input_behavior_name').value;
		if (old_name == new_name) return;

		let activity_text = (old_name == "")? "Set behavior name to " + new_name :
							(new_name == "")? "Deleted behavior name " + old_name :
							"Changed behavior name from " + old_name + " to " + new_name;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setBehaviorName(old_name); document.getElementById('input_behavior_name').value = Behavior.getBehaviorName(); },
			function() { Behavior.setBehaviorName(new_name); document.getElementById('input_behavior_name').value = Behavior.getBehaviorName(); }
		);
		console.log(`behaviorNameChanged: '${new_name}' from '${old_name}'`);
		Behavior.setBehaviorName(new_name);
	}

	this.behaviorPackageChanged = function() {
		let old_package = Behavior.getBehaviorPackage();
		let selection_element = document.getElementById('select_behavior_package');
		let new_package = selection_element.value;
		if (old_package == new_package) return;

		let activity_text = (old_package == "")? "Set behavior package to " + new_package :
							(new_package == "")? "Deleted behavior package " + old_package :
							"Changed behavior package from " + old_package + " to " + new_package;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setBehaviorPackage(old_package); document.getElementById('select_behavior_package').value = Behavior.getBehaviorPackage(); },
			function() { Behavior.setBehaviorPackage(new_package); document.getElementById('select_behavior_package').value = Behavior.getBehaviorPackage(); }
		);

		Behavior.setBehaviorPackage(new_package);
		selection_element.blur(); // lose focus on selection
	}

	this.behaviorDescriptionChanged = function() {
		let old_desc = Behavior.getBehaviorDescription();
		let new_desc = document.getElementById('input_behavior_description').value;
		if (old_desc == new_desc) return;

		let activity_text = (old_desc == "")? "Set behavior description to " + ((new_desc.length > 33)? new_desc.slice(0,30) + "..." : new_desc) :
							(new_desc == "")? "Deleted behavior description" :
							"Changed behavior description to " + ((new_desc.length > 33)? new_desc.slice(0,30) + "..." : new_desc);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setBehaviorDescription(old_desc); document.getElementById('input_behavior_description').value = Behavior.getBehaviorDescription(); },
			function() { Behavior.setBehaviorDescription(new_desc); document.getElementById('input_behavior_description').value = Behavior.getBehaviorDescription(); }
		);

		Behavior.setBehaviorDescription(new_desc);
	}

	this.behaviorTagsChanged = function() {
		let old_tags = Behavior.getTags();
		let new_tags = document.getElementById('input_behavior_tags').value;
		if (old_tags == new_tags) return;

		let activity_text = (old_tags == "")? "Set tags to " + new_tags :
							(new_tags == "")? "Deleted tags " + old_tags :
							"Changed tags from " + old_tags + " to " + new_tags;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setTags(old_tags); document.getElementById('input_behavior_tags').value = Behavior.getTags(); },
			function() { Behavior.setTags(new_tags); document.getElementById('input_behavior_tags').value = Behavior.getTags(); }
		);

		Behavior.setTags(new_tags);
	}

	this.behaviorAuthorChanged = function() {
		let old_aut = Behavior.getAuthor();
		let new_aut = document.getElementById('input_behavior_author').value;
		if (old_aut == new_aut) return;

		let activity_text = (old_aut == "")? "Set author to " + new_aut :
							(new_aut == "")? "Deleted author " + old_aut :
							"Changed author from " + old_aut + " to " + new_aut;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setAuthor(old_aut); document.getElementById('input_behavior_author').value = Behavior.getAuthor(); },
			function() { Behavior.setAuthor(new_aut); document.getElementById('input_behavior_author').value = Behavior.getAuthor(); }
		);

		Behavior.setAuthor(new_aut);
	}

	this.behaviorDateChanged = function() {
		let old_date = Behavior.getCreationDate();
		let new_date = document.getElementById('input_behavior_date').value;
		if (old_date == new_date) return;

		let activity_text = (old_date == "")? "Set creation date to " + new_date :
							(new_date == "")? "Deleted creation date " + old_date :
							"Changed creation date from " + old_date + " to " + new_date;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			activity_text,
			function() { Behavior.setCreationDate(old_date); document.getElementById('input_behavior_date').value = Behavior.getCreationDate(); },
			function() { Behavior.setCreationDate(new_date); document.getElementById('input_behavior_date').value = Behavior.getCreationDate(); }
		);

		Behavior.setCreationDate(new_date);
	}

	this.setBehaviorName = function(value) {
		document.getElementById('input_behavior_name').value = value;
		that.behaviorNameChanged();
	}

	this.setBehaviorPackage = function(value) {
		document.getElementById('select_behavior_package').value = value;
		that.behaviorPackageChanged();
	}

	this.setBehaviorDescription = function(value) {
		document.getElementById('input_behavior_description').value = value;
		that.behaviorDescriptionChanged();
	}

	this.setBehaviorTags = function(value) {
		document.getElementById('input_behavior_tags').value = value;
		that.behaviorTagsChanged();
	}

	this.setBehaviorAuthor = function(value) {
		document.getElementById('input_behavior_author').value = value;
		that.behaviorAuthorChanged();
	}

	this.setBehaviorDate = function(value) {
		document.getElementById('input_behavior_date').value = value;
		that.behaviorDateChanged();
	}

	this.addPrivateVariable = async function(new_key, new_value) {
		let privateVariables = Behavior.getPrivateVariables();
		let match = privateVariables.find((element) => {return element.key === new_key;});

		if  (match != undefined) {
			console.log(`Cannot not add duplicate key to private variables!`);
			let ack = await UI.Tools.customAcknowledge("Duplicate keys are not allowed.<br><br>Select button to continue.")
			document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
			return;
		}

		if (new_key == '') {
			console.log(`Must define both key and value before adding private variable!`);
			let ack = await UI.Tools.customAcknowledge("Must define both key and value before adding!<br><br>"
										+"Select button to continue.");
			document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
			return;
		}

		if (new_value === '') {
			console.log(`Must define both key and value before adding private variable!`);
			let ack = await UI.Tools.customAcknowledge("Must define both key and value before adding!<br><br>"
										+"Select any button to continue.");
			document.getElementById("input_db_variable_value_add").focus({ preventScroll: true });
			return;
		}

		document.getElementById("input_db_variable_key_add").value = "";
		document.getElementById("input_db_variable_value_add").value = "";
		document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
		return that._addPrivateVariable(new_key, new_value)
	}

	this.addPrivateVariableClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_key = document.getElementById("input_db_variable_key_add").value.trim();
		let new_value = document.getElementById("input_db_variable_value_add").value.trim();
		await that.addPrivateVariable(new_key, new_value);
	}

	this.addDefaultUserdata = async function(new_key, new_value) {

		let userData = Behavior.getDefaultUserdata();
		let match = userData.find((element) => {
			return element.key === new_key;});

		if  (match != undefined) {
			console.log(`Cannot not add duplicate key to user data!`);
			let ack = await UI.Tools.customAcknowledge("Duplicate keys in userdata are not allowed.<br><br>Select button to continue.")
			document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
			return false;
		}

		if (new_key == '') {
			console.log(`Must define both key and value for userdata before adding!`);
			let ack = await UI.Tools.customAcknowledge("Must define both key and value for userdata before adding!<br><br>"
										+"Select any button to continue.");
			document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
			return false;
		}

		if (new_value === '') {
			console.log(`Must define both key and value for userdata before adding!`);
			let ack = await UI.Tools.customAcknowledge("Must define both key and value for userdata before adding!<br><br>"
										+"Select any button to continue.");
			document.getElementById("input_db_userdata_value_add").focus({ preventScroll: true });
			return false;
		}

		document.getElementById("input_db_userdata_key_add").value = "";
		document.getElementById("input_db_userdata_value_add").value = "";
		return that._addDefaultUserdata(new_key, new_value);
	}

	this.addDefaultUserdataClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_key = document.getElementById("input_db_userdata_key_add").value.trim();
		let new_value = document.getElementById("input_db_userdata_value_add").value.trim();
		await that.addDefaultUserdata(new_key, new_value);
	}

	this.addParameter = function(new_type, new_name) {
		that._addBehaviorParameter(new_type, new_name);
	}
	this.addParameterClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let type_select = document.getElementById("input_db_parameter_type_add");
		let new_name = document.getElementById("input_db_parameter_name_add").value.trim();
		if (type_select == undefined || new_name === '') {
			console.log("Must define both type and parameter name before adding!");
			let ack = await UI.Tools.customAcknowledge("Must define both type and parameter name before adding!<br><br>Select button to continue.");
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			return;
		}

		UI.Dashboard.addParameter(type_select.options[type_select.selectedIndex].value, new_name);
		document.getElementById("input_db_parameter_type_add").selectedIndex = 0;
		document.getElementById("input_db_parameter_name_add").value = "";
	}
	this.turnParameterClicked = function(event) {
		if (event != undefined) {
			event.stopPropagation();
			event.preventDefault();
		}

		document.getElementById("parameter_flipper").classList.toggle("flip");
		if (show_param_edit) {
			// currently editing, remove listeners and flip back to listing
			that.clearChildElements('db_field_parameter_edit_table_', false);
			listeners_to_cleanup = listeners_to_cleanup.filter(({ element, listener_type, handler}) => {
				if (element.id === 'db_parameter_edit_table_turn_button') {
					element.removeEventListener(listener_type, handler);
					return false;
				}
				return true;
			});

			parameter_tab_targets.length = 0;
			if (parameter_flip_focus) parameter_flip_focus.focus({'preventScroll': true});
			parameter_flip_focus = undefined;
		} else {
			parameter_flip_focus = document.activeElement; // Store for return
			parameter_tab_targets[0].focus({'preventScroll': true});
		}
		show_param_edit = !show_param_edit;
	}

	this.addPrivateFunction = function(new_name, new_params) {
		that._addPrivateFunction(new_name, new_params);
	}

	this.addBehaviorOutcome = function(new_outcome) {
		that._addBehaviorOutcome(new_outcome);
	}

	this.addBehaviorOutcomeClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_name = document.getElementById("input_db_outcome_add").value.trim();
		if (new_name === '') {
			T.logError('Must define name before clicking add!');
			return;
		}
		UI.Dashboard.addBehaviorOutcome(new_name);
		document.getElementById("input_db_outcome_add").value = "";
	}

	this.addBehaviorInputKey = function(new_key) {
		that._addBehaviorInputKey(new_key);
	}

	this.addBehaviorInputKeyClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_name = document.getElementById("input_db_input_key_add").value.trim();
		if (new_name === '') {
			T.logError('Must define name before clicking add!');
			return;
		}
		UI.Dashboard.addBehaviorInputKey(new_name);
		document.getElementById("input_db_input_key_add").value = "";
	}

	this.addBehaviorOutputKey = function(new_key) {
		that._addBehaviorOutputKey(new_key);
	}

	this.addBehaviorOutputKeyClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_name = document.getElementById("input_db_output_key_add").value.trim();
		if (new_name === '') {
			T.logError('Must define name before clicking add!');
			return;
		}

		UI.Dashboard.addBehaviorOutputKey(new_name);
		document.getElementById("input_db_output_key_add").value = "";
	}

	this.resetAllFields = function() {
		UI.Settings.createBehaviorPackageSelect(document.getElementById('select_behavior_package'));
		Behavior.setBehaviorPackage(UI.Settings.getDefaultPackage());
		document.getElementById('input_behavior_name').value = "";
		document.getElementById('input_behavior_description').value = "";
		document.getElementById('input_behavior_tags').value = "";
		document.getElementById('input_behavior_author').value = "";
		let current_date_string = (new Date()).toDateString();
		document.getElementById('input_behavior_date').value = current_date_string;
		Behavior.setCreationDate(current_date_string);

		if (show_param_edit) {
			that.turnParameterClicked(undefined);
		}

		document.getElementById('db_variable_table').innerHTML = "";
		document.getElementById('db_userdata_table').innerHTML = "";
		document.getElementById('db_parameter_table').innerHTML = "";
		document.getElementById('db_function_table').innerHTML = "";
		document.getElementById('db_outcome_table').innerHTML = "";
		document.getElementById('db_input_key_table').innerHTML = "";
		document.getElementById('db_output_key_table').innerHTML = "";

		document.getElementById('db_manual_import_table').innerHTML = "";

		document.getElementById('db_function_edit_modal_text').value = "";

		that.clearChildElements('', false); // clear all
		tab_targets = that.updateTabTargets("dashboard");

		// also reset input fields?
		// currently not

	}

	//
	//  Manual Import Statements
	// =========================

	this._addManualImport = function(new_value) {
		console.log(`\x1b[92m adding Manual import '${new_value}' ...\x1b[0m`);
		try {
			let imports = Behavior.getManualCodeImport();
			imports.push(new_value.trim());
		} catch (err) {
			console.log(`cannot add item due to ${err}`);
			return;
		}

		let tr = document.createElement("tr");

		const removeFunction = function(import_value) {
			tr.parentNode.removeChild(tr);
			let index = Behavior.getManualCodeImport().findIndex(function (element) {
				return element.trim() == import_value.trim(); });
			if (index !== -1) {
				 Behavior.getManualCodeImport().splice(index, 1);
			}
			that.clearChildElements("db_manual_import_table_remove_button_"+new_value.replace(' ', '_'));
			that.clearChildElements("db_manual_import_table_input_" + new_value.replace(' ', '_'));
		};
		const addFunction = function(import_value) {
			document.getElementById("db_manual_import_table").appendChild(tr);
			Behavior.getManualCodeImport().push(import_value);
		};
		const changeValueFunction = function(new_value, element) {
			let old_value = element.getAttribute("old_value");
			let index = Behavior.getManualCodeImport().findIndex(function (el) {
				return el == old_value; });
			if (index !== -1) {
				Behavior.getManualCodeImport()[index] = new_value;
			}
			element.setAttribute("old_value", new_value);
			if (Checking.isValidImportStatement(new_value)) {
				element.style.backgroundColor = "#7CFC00";
			} else {
				console.log(`\x1b[92m Invalid import statement '${new_value}'!\x1b[0m`);
				element.style.backgroundColor = "#FF4500";
			}
			element.value = new_value;
		};

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_manual_import_table_remove_button_" + new_value.replace(' ', '_'))
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this import");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let value = value_input_field.getAttribute("old_value");
			removeFunction(value);

			ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
				"Removed manual import " + value,
				function() { addFunction(value); },
				function() { removeFunction(value); }
			);
		};
		remove_button.addEventListener("click", removeHandler);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeHandler});

		const onEnterRemove = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				removeHandler(event);
			}
		}
		remove_button.addEventListener("keydown", onEnterRemove);
		listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'keydown', 'handler': onEnterRemove});

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_manual_import_table_input_" + new_value.replace(' ', '_'));
		value_input_field.setAttribute("value", new_value);
		value_input_field.setAttribute("old_value", new_value);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", "text");
		if (Checking.isValidImportStatement(new_value)) {
			value_input_field.style.backgroundColor = "#7CFC00";
		} else {
			console.log(`\x1b[92m Invalid import statement '${new_value}'!\x1b[0m`);
			value_input_field.style.backgroundColor = "#FF4500";
		}

		const blurHandler = function(event) {
			let old_value = value_input_field.getAttribute("old_value");
			let new_value = value_input_field.value;
			if (old_value == new_value) return;
			changeValueFunction(new_value, value_input_field);

			ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
				`Changed manual import to '${new_value}'`,
				function() { changeValueFunction(old_value, value_input_field); },
				function() { changeValueFunction(new_value, value_input_field); }
			);
		};
		value_input_field.addEventListener("blur", blurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': blurHandler});

		const enterHandler = function(event) {
			if (event.key === "Enter") {
				let old_value = value_input_field.getAttribute("old_value");
				let new_value = value_input_field.value;
				if (old_value == new_value) return;
				changeValueFunction(new_value, value_input_field);

				ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
					`Changed manual import to '${new_value}'`,
					function() { changeValueFunction(old_value, value_input_field); },
					function() { changeValueFunction(new_value, value_input_field); }
				);
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
			}
		};
		value_input_field.addEventListener("keydown", enterHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'keydown', 'handler': enterHandler});

		let td_value_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_value_input_field.appendChild(value_input_field);
		td_remove_button.appendChild(remove_button);
		tr.appendChild(td_value_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_manual_import_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_ADD,
			`Added manual import '${new_value}'`,
			function() { removeFunction(new_value); },
			function() { addFunction(new_value); }
		);
		tab_targets = that.updateTabTargets("dashboard");
	}

	this.addManualImport = function(new_value) {
		that._addManualImport(new_value);
	}

	this.addManualImportClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_value = document.getElementById("input_db_manual_import_value_add").value.trim();
		if (new_value === '') {
			T.logError('Must define import statement before clicking add!');
			return;
		}

		UI.Dashboard.addManualImport(new_value);
		document.getElementById("input_db_manual_import_value_add").value = "";
	}

	this.setupTabHandling = function() {
		if (document.activeElement) {
			document.activeElement.blur();
		}
		tab_targets = that.updateTabTargets("dashboard");
		if (tab_targets.length > 0) {
			tab_targets[0].focus({ preventScroll: true });
			// console.log(`set focus to '${ document.activeElement ? document.activeElement.id : 'undefined'}' (${tab_targets[0].id})`)
		}
	}

	this.removeTabHandling = function() {
		// console.log(`\x1b[94mDeactivate TAB handling for dashboard ...\x1b[0m`);
		tab_targets.length = 0;
	}

	this.clearChildElements = function(filter='', exact=true) {
		try {
			const elementsToRemove = new Set();
			listeners_to_cleanup.forEach(({element, listener_type, handler}) => {
				// filter='' and exact=false catches all elements
				if (exact ? (element.id === filter) : element.id.startsWith(filter)) {
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

	this.updateTabTargets = function(panel_id) {
		let select_tags = 'input, textarea, select, button, .img_button, .edit-box';

		let panel = document.getElementById(panel_id);
		let targets = Array.from(panel.querySelectorAll(select_tags));
		targets = targets.filter(function(el) {
			if (el.tabIndex === -1) {
				 return false;
			}
			if (el.id == '') {
				return false;
			}
			if (panel_id !== 'db_parameter_edit_table' &&
				(el.id.startsWith('db_field_parameter_edit_table_') || el.id === 'db_parameter_edit_table_turn_button')) {
				return false; // we handle the parameter flipper independently
			}
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
			// Panel is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers

			let match = undefined;
			let match_ndx = -1;

			if (show_param_edit) {
				// special handling for parameter edit flipper
				if (document.activeElement) {
					for (let i = 0; i < parameter_tab_targets.length; i++) {
						if (document.activeElement.id === parameter_tab_targets[i].id) {
							match_ndx = i;
							break;
						}
					}
				}

				if (match_ndx < 0) match_ndx = parameter_tab_targets.length - 1;
				match_ndx = event.shiftKey
								? (match_ndx - 1 + parameter_tab_targets.length) % parameter_tab_targets.length
								: (match_ndx + 1) % parameter_tab_targets.length;

				let tab_id = parameter_tab_targets[match_ndx].id;
				document.getElementById(tab_id).focus({ preventScroll: true });
				return;
			}

			// Regular dashboard TAB handling
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
				tab_targets[0].focus({ preventScroll: true }); // Move focus to the first input
			}
		}
	}

	this.handleKeyUp = function(event) {
		if (event.key === "Tab") {
			// Dashboard editor is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
	}

}) ();
