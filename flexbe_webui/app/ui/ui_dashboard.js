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
		let childRow = document.getElementById("db_field_variable_table_row_" + var_key.replace(' ', '_'));
		if (entry == undefined || childRow == undefined) {
			console.log(`\x1b[93mPrivateVariable.removePrivateVariable - unknown entry (${entry}) or child row (${childRow}) for '${var_key}'\x1b[0m`);
			return false;
		}

		Behavior.getPrivateVariables().remove(entry);

		// clear using exact match
		that.clearChildElements("db_field_variable_table_remove_button_" + var_key.replace(' ', '_'));
		that.clearChildElements("db_field_variable_table_key_input_" + var_key.replace(' ', '_'));
		that.clearChildElements("db_field_variable_table_value_input_" + var_key.replace(' ', '_'));
		document.getElementById("db_variable_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
			"Removed private variable '" + key + "'",
			function() { that.addPrivateVariable(key, value); },
			function() { that.removePrivateVariable(key); }
		);
		return true;
	};

	this.changePrivateVariableKeyFunction = async function(new_key, old_key) {
		if (new_key == old_key) {
			console.log(`Ignoring changePrivateVariableKeyFunction for '${old_key}' with no change`);
			return false;
		}

		const old_id = old_key.replace(' ', '_');

		let privateVars = Behavior.getPrivateVariables();
		let entry = privateVars.findElement((el) => { return el.key == old_key; });
		let keyElement = document.getElementById('db_field_variable_table_key_input_' + old_id);
		if (entry == undefined || keyElement == undefined) {
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // red flag
			}
			return false;
		}

		let match = privateVars.findElement((el) => {return el.key === new_key && el != entry;});
		if (match != undefined) {
			console.log(`Cannot not use a duplicate key in private variables! ('${new_key}' in '${keyElement.id}')  (active='${document.activeElement.id}')`);
			await UI.Tools.customAcknowledge("Duplicate keys in private variables are not allowed.<br><br>Select button to continue.")
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // red flag
			return false;
		}

		if (!Checking.isValidPythonVarname(new_key)) {
			console.log(`Key must be a valid Python variable (not '${new_key}')!`);
			await UI.Tools.customAcknowledge("Key must be a valid Python variable!<br><br>"
											+"Select any button to continue.");
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77";
			return;
		}

		const new_id = new_key.replace(' ', '_');

		// new key is acceptable
		entry.key = new_key;
		keyElement.setAttribute("key", new_key);
		keyElement.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		keyElement.value = new_key;
		keyElement.id = "db_field_variable_table_key_input_" + new_id
		keyElement.style.backgroundColor = "#fff"; // clear prior error flag

		// Update the other element ids with new key value
		let variableRow = document.getElementById("db_field_variable_table_row_" + old_id);
		variableRow.id = "db_field_variable_table_row_" + new_id;
		let removeElement = document.getElementById("db_field_variable_table_remove_button_" + old_id);
		removeElement.id = "db_field_variable_table_remove_button_" + new_id;
		let valueElement = document.getElementById("db_field_variable_table_value_input_" + old_id);
		valueElement.id = "db_field_variable_table_value_input_" + new_id;

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
		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Changed private variable " + key + " to " + new_value,
			function() { that.changePrivateVariableValueFunction(old_value, key); },
			function() { that.changePrivateVariableValueFunction(new_value, key); }
		);
		return true;
	};

	this._addPrivateVariable = function(new_key, new_value) {
		let privateVariables = Behavior.getPrivateVariables();
		let match = privateVariables.find((element) => {return element.key === new_key;});
		if  (match != undefined) {
			T.logError(`Attempted to add duplicate key '${new_key}' to private variables! (fix bad code)`);
			return false;
		}

		const new_id = new_key.replace(' ', '_');

		let key_input_field = document.createElement("input");
		key_input_field.setAttribute("id", "db_field_variable_table_key_input_" + new_id);
		key_input_field.setAttribute("value", new_key);
		key_input_field.setAttribute("key", new_key);
		key_input_field.setAttribute("class", "inline_text_edit");
		key_input_field.setAttribute("type", "text");
		key_input_field.setAttribute("tabindex", "0");
		key_input_field.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		const keyInputBlurHandler = async function(event) {
			let old_key = key_input_field.getAttribute("key");
			let new_key = key_input_field.value;
			key_input_field.style.backgroundColor = "#fff"; // clear prior error flag
			if (old_key == new_key) return;

			setTimeout(() => {that.changePrivateVariableKeyFunction(new_key, old_key)}, 0);

		};
		key_input_field.addEventListener("blur", keyInputBlurHandler);
		listeners_to_cleanup.push({'element': key_input_field, 'listener_type': 'blur', 'handler': keyInputBlurHandler});

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_variable_table_value_input_" + new_id);
		value_input_field.setAttribute("value", new_value);
		value_input_field.setAttribute("old_value", new_value);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", "text");
		value_input_field.setAttribute("tabindex", "0");
		value_input_field.style.backgroundColor = Checking.setColorByEntryType(new_value);
		const valueInputBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = key_input_field.getAttribute("key");
			let old_value = value_input_field.getAttribute("old_value");
			let new_value = value_input_field.value;
			if (old_value == new_value) return;
			setTimeout(() => {that.changePrivateVariableValueFunction(new_value, key)}, 0);
		};
		value_input_field.addEventListener("blur", valueInputBlurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': valueInputBlurHandler});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_variable_table_remove_button_" + new_id);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this variable");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		remove_button.setAttribute("tabindex", "0");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = key_input_field.getAttribute("key");
			setTimeout(() => {that.removePrivateVariable(key)}, 0);
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
		tr.id = "db_field_variable_table_row_" + new_id
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
		document.getElementById("input_db_variable_key_add").value = "";
		document.getElementById("input_db_variable_value_add").value = "";
		document.getElementById("input_db_variable_key_add").style.backgroundColor = "#fff";
		document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });

		return true;
	}

	//
	//  State Machine Userdata
	// ========================

	this.removeDefaultUserdata = function(var_key) {
		var_key = var_key.trim();
		let element = Behavior.getDefaultUserdata().findElement(function (element) { return element.key == var_key; });
		let childRow = document.getElementById("db_field_userdata_table_row_"+var_key.replace(' ', '_'));
		if (element == undefined || childRow == undefined) {
			console.log(`\x1b[93m removeUserdata - unknown entry (${element}) or `
						+`child row (${childRow}) for '${var_key}'\x1b[0m`);
			return;
		}

		Behavior.getDefaultUserdata().remove(element);
		that.clearChildElements("db_field_userdata_table_remove_button_"+var_key.replace(' ', '_'));
		that.clearChildElements("db_field_userdata_table_key_input_"+var_key.replace(' ', '_'));
		that.clearChildElements("db_field_userdata_table_value_input_"+var_key.replace(' ', '_'));
		document.getElementById("db_userdata_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
			"Removed userdata " + key,
			function() { that.addDefaultUserdata(key, value); },
			function() { that.removeDefaultUserdata(key); }
		);
		return true;
	};

	this.changeDefaultUserdataKey = async function(new_key, old_key) {

		if (new_key === old_key) {
			console.log(`Ignoring change userdata key with no change '${new_key}' v '${old_key}'`)
			return false;
		}
		let userData = Behavior.getDefaultUserdata();
		let entry = userData.findElement(function (el) { return el.key == old_key; });
		let keyElement = document.getElementById('db_field_userdata_table_key_input_' + old_key);
		if (entry == undefined || keyElement == undefined) {
			console.log(`\x1b[91mFailed to find matching entry for '${old_key}' (ignore '${new_key}') - ${entry} ${keyElement}\x1b[0m`);
			if (keyElement) {
				keyElement.style.backgroundColor = "#f77"; // flag error
				keyElement.focus({preventScroll: true});
			}
			return false;
		}
		let match = userData.find((element) => {return element.key === new_key && element != entry;});
		if (match != undefined) {
			console.log(`Cannot not use a duplicate key in user data!`);
			await UI.Tools.customAcknowledge("Duplicate keys in userdata are not allowed.<br><br>Select button to continue.")
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // flag error
			return false;
		}

		if (!Checking.isValidPythonVarname(new_key)) {
			console.log(`Userdata should be a valid Python variable (not '${new_key}') to allow access via dot operator!`);
			await UI.Tools.customAcknowledge("Key should be a valid Python variable<br>"
											+"to allow access via dot operator!<br>"
											+"Select any button to continue.");
			keyElement.focus({ preventScroll: true });
			// allow designer to override this warning
		}

		const new_id = new_key.replace(' ', '_');

		// new key is acceptable
		entry.key = new_key;
		keyElement.setAttribute("key", new_key);
		keyElement.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";
		keyElement.value = new_key;
		keyElement.id = "db_field_userdata_table_key_input_" + new_id
		keyElement.style.backgroundColor = "#fff"; // clear error

		// Update the other element ids with new key value
		const old_id = old_key.replace(' ', '_');

		let userdataRow = document.getElementById("db_field_userdata_table_row_" + old_id);
		userdataRow.id = "db_field_userdata_table_row_" + new_id;
		let removeElement = document.getElementById("db_field_userdata_table_remove_button_" + old_id);
		removeElement.id = "db_field_userdata_table_remove_button_" + new_id;
		let valueElement = document.getElementById("db_field_userdata_table_value_input_" + old_id);
		valueElement.id = "db_field_userdata_table_value_input_" + new_id;

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Renamed statemachine userdata " + old_key + " to " + new_key,
			function() { that.changeDefaultUserdataKey(old_key, new_key); },
			function() { that.changeDefaultUserdataKey(new_key, old_key); }
		);

		return true;
	};

	this.changeDefaultUserdataValue = function(new_value, key) {
		let entry = Behavior.getDefaultUserdata().findElement(function (el) { return el.key == key; });
		if (entry == undefined) {
			console.log(`Failed to find a valid entry to changeValue for statemachine userdata '${key}'`);
			return false;
		}

		let element = document.getElementById('db_field_userdata_table_value_input_' + key);
		let old_value = entry.value;

		element.setAttribute("old_value", entry.value);
		element.style.backgroundColor = Checking.setColorByEntryType(new_value);
		element.value = new_value;
		entry.value = new_value;

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Updated statemachine userdata for '" + key + "' to '" + new_value + "'",
			function() { that.changeDefaultUserdataValue(old_value, key); },
			function() { that.changeDefaultUserdataValue(new_value, key); }
		);

		return true;

	};

	this._addDefaultUserdata = function(new_key, new_value) {
		let userData = Behavior.getDefaultUserdata();
		let match = userData.find((element) => {return element.key === new_key;});
		if  (match != undefined) {
			T.logError(`\xb1[93mAdded duplicate key '${new_key}' to userdata! (fix bad code)\x1b[0m`);
		}

		const new_id = new_key.replace(' ', '_');

		let key_input_field = document.createElement("input");
		key_input_field.setAttribute("id", "db_field_userdata_table_key_input_"+new_id);
		key_input_field.setAttribute("value", new_key);
		key_input_field.setAttribute("key", new_key);
		key_input_field.setAttribute("class", "inline_text_edit");
		key_input_field.setAttribute("type", "text");
		key_input_field.style.backgroundColor = Checking.isValidPythonVarname(new_key)? "initial" : "#fca";

		const keyInputBlurHandler = async function(event) {
			let old_key = key_input_field.getAttribute("key");
			let new_key = key_input_field.value;
			key_input_field.style.backgroundColor = "#fff"; // clear error
			if (old_key == new_key) return;
			setTimeout(() => {that.changeDefaultUserdataKey(new_key, old_key)}, 0);
		};
		key_input_field.addEventListener("blur", keyInputBlurHandler);
		listeners_to_cleanup.push({'element': key_input_field, 'listener_type': 'blur', 'handler': keyInputBlurHandler});

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_userdata_table_value_input_"+new_id);
		value_input_field.setAttribute("value", new_value);
		value_input_field.setAttribute("old_value", new_value);
		value_input_field.setAttribute("class", "inline_text_edit");
		value_input_field.setAttribute("type", "text");
		value_input_field.style.backgroundColor = Checking.setColorByEntryType(new_value);
		const valueInputBlurHandler = async function(event) {
			let key = key_input_field.getAttribute("key");
			let old_value = value_input_field.getAttribute("old_value");
			let new_value = value_input_field.value;
			if (old_value == new_value) return;
			setTimeout(() => {that.changeDefaultUserdataValue(new_value, key)}, 0);
		};
		value_input_field.addEventListener("blur", valueInputBlurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': valueInputBlurHandler});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_userdata_table_remove_button_" + new_id);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this userdata");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = key_input_field.getAttribute("key");
			setTimeout(() => {that.removeDefaultUserdata(key)}, 0);
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


		let td_key_input_field = document.createElement("td");
		let td_label = document.createElement("td");
		let td_value_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_key_input_field.appendChild(key_input_field);
		td_label.innerHTML = "&nbsp;&nbsp;=&nbsp;";
		td_value_input_field.appendChild(value_input_field);
		td_remove_button.appendChild(remove_button);

		let tr = document.createElement("tr");
		tr.id = "db_field_userdata_table_row_" + new_id;
		tr.appendChild(td_key_input_field);
		tr.appendChild(td_label);
		tr.appendChild(td_value_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_userdata_table").appendChild(tr);

		userData.push({key: new_key, value: new_value});

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_ADD,
			"Added userdata " + new_key + " = " + new_value,
			function() { that.removeDefaultUserdata(new_key); },
			function() { that.addDefaultUserdata(new_key, new_value); }
		);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_userdata_key_add").value = "";
		document.getElementById("input_db_userdata_value_add").value = "";
		document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
		return true;
	}

	//
	//  Behavior Parameters
	// ===================
	this.removeBehaviorParameter = function(param_name) {
		let entry = Behavior.getBehaviorParameterElement(param_name);
		let childRow = document.getElementById("db_field_parameter_table_row_"+param_name.replace(' ', '_'));
		if (entry == undefined || childRow == undefined) {
			console.log(`\x1b[93m removeBehaviorParameter - unknown entry (${entry}) or `
						+`child row (${childRow}) for '${param_value}'\x1b[0m`);
			return false;
		}

		Behavior.removeBehaviorParameter(param_name);
		that.clearChildElements("db_field_parameter_table_type_input_" + param_name.replace(' ', '_'));
		that.clearChildElements("db_field_parameter_table_name_input_" + param_name.replace(' ', '_'));
		that.clearChildElements("db_field_parameter_table_edit_button_" + param_name.replace(' ', '_'));
		that.clearChildElements("db_field_parameter_table_remove_button_" + param_name.replace(' ', '_'));

		document.getElementById("db_parameter_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Removed behavior parameter '" + param_name + "'",
			function() { that.addBehaviorParameter(param_name); },
			function() { that.removeBehaviorParameter(param_name); }
		);
		return true;
	}

	this.changeBehaviorParameterName = async function(new_name, old_name) {

		if (new_name == old_name) {
			console.log(`Ignoring changeBehaviorParameterName for '${old_name}' with no change`);
			return false;
		}

		let entry = Behavior.getBehaviorParameterElement(old_name);
		let keyElement = document.getElementById('db_field_parameter_table_name_input_' + old_name.replace(' ', '_'));
		if (entry == undefined || keyElement == undefined) {
			console.log(`\x1b[93m changeBehaviorParameterName - unknown entry (${entry}) or key element (${keyElement}) for '${old_name}'\x1b[0m`);
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // flag error
			}
			return false;
		}

		let match = Behavior.getBehaviorParameters().findIndex((el, ndx) => {
			return el.name === new_name && el != entry;
		});
		if (match != -1) {
			console.log(`Cannot not use a duplicate name! ('${new_name}' in '${keyElement.id}')  (active='${document.activeElement.id}')`);
			await UI.Tools.customAcknowledge(`Duplicate parameter names (${new_name}) are not allowed.<br><br>`
											+ `Select button to continue.`)
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // flag error

			return false;
		}

		if (!Checking.isValidPythonVarname(new_name)) {
			console.log(`Parameter name must be a valid Python variable (not '${new_name}')!`);
			await UI.Tools.customAcknowledge("Parameter name must be a valid Python variable!<br><br>"
											+"Select any button to continue.");
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77";
			return false;
		}

		keyElement.style.backgroundColor = "#fff"; // clear error
		keyElement.value = new_name;
		entry.name = new_name;
		// Update existing hint and label if based only on the old name
		if (entry.label == old_name) entry.label = new_name;
		if (entry.hint == "Sets the " + old_name) entry.hint = "Sets the " + new_name;

		const old_id = old_name.replace(' ', '_');
		let typeEl = document.getElementById("db_field_parameter_table_type_input_" + old_id);
		let editEl = document.getElementById("db_field_parameter_table_edit_button_" + old_id);
		let removeEl = document.getElementById("db_field_parameter_table_remove_button_" + old_id);
		let rowEl = document.getElementById("db_field_parameter_table_row_" + old_id);
		keyElement.setAttribute("name", new_name);
		typeEl.setAttribute("name", new_name);
		editEl.setAttribute("name", new_name);
		removeEl.setAttribute("name", new_name);

		const new_id = new_name.replace(' ', '_');
		keyElement.id = "db_field_parameter_table_name_input_" + new_id;
		typeEl.id     = "db_field_parameter_table_type_input_" + new_id;
		editEl.id = "db_field_parameter_table_edit_button_" + new_id;
		removeEl.id = "db_field_parameter_table_remove_button_" + new_id;
		rowEl.id ="db_field_parameter_table_row_" + new_id;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Renamed behavior parameter '" + new_name + "'",
			function() { that.changeBehaviorParameterName(old_name, new_name); },
			function() { that.changeBehaviorParameterName(new_name, old_name); }
		);
		return true;
	}
	this._addBehaviorParameter = async function(new_type, new_name) {
		let daa = getDefaultAndAdditional(new_type);

		let existing = Behavior.getBehaviorParameterElement(new_name);
		if (existing != undefined) {
			console.log(`Parameter name '${new_name}' already exists! (bad code should not get here!)`);
			await UI.Tools.customAcknowledge(`Parameter name '${new_name}' already exists!<br><br>Select button to continue.`)
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			return false;
		}

		let edit_button = document.createElement("img");
		edit_button.setAttribute("id", "db_field_parameter_table_edit_button_" + new_name.replace(' ', '_'));
		edit_button.setAttribute("src", "img/pencil.png");
		edit_button.setAttribute("title", "Edit this parameter");
		edit_button.setAttribute("class", "img_button");
		edit_button.setAttribute("style", "margin-left: 10px;");
		edit_button.setAttribute("tabindex", "0");
		edit_button.setAttribute("name", new_name);
		const editButtonHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let name = edit_button.getAttribute("name");

			setTimeout(() => {	that.createBehaviorParameterEdit(name);
								that.turnParameterClicked(event)},0);
		};
		edit_button.addEventListener("click", editButtonHandler);
		listeners_to_cleanup.push({'element': edit_button, 'listener_type': 'click', 'handler': editButtonHandler});

		const onEnterEdit = function(event) {
			if (event.key === 'Enter' || event.key === ' ') {
				editButtonHandler(event);
			}
		}
		edit_button.addEventListener("keydown", onEnterEdit);
		listeners_to_cleanup.push({'element': edit_button, 'listener_type': 'keydown', 'handler': onEnterEdit});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_parameter_table_remove_button_" + new_name.replace(' ', '_'));
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
			setTimeout(() => {that.removeBehaviorParameter(name);}, 0);
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
		type_input_field.setAttribute("id", "db_field_parameter_table_type_input_" + new_name.replace(' ', '_'));
		type_input_field.setAttribute("name", new_name);
		type_input_field.setAttribute("class", "inline_text_edit");
		const typeBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
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
		name_input_field.setAttribute("id", "db_field_parameter_table_name_input_"+new_name.replace(' ', '_'));
		name_input_field.setAttribute("value", new_name);
		name_input_field.setAttribute("name", new_name);
		name_input_field.setAttribute("class", "inline_text_edit");
		name_input_field.setAttribute("type", "text");
		const nameBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let old_name = name_input_field.getAttribute("name"); // prior name
			let new_name = name_input_field.value.trim();
			name_input_field.style.backgroundColor = "#fff"; // clear error
			if (old_name == new_name) return;
			setTimeout(() => {that.changeBehaviorParameterName(new_name, old_name)}, 0);
		};
		name_input_field.addEventListener("blur", nameBlurHandler);
		listeners_to_cleanup.push({'element': name_input_field, 'listener_type': 'blur', 'handler': nameBlurHandler});

		let td_type_input_field = document.createElement("td");
		let td_name_input_field = document.createElement("td");
		let td_edit_button = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_type_input_field.appendChild(type_input_field);
		td_name_input_field.appendChild(name_input_field);
		td_edit_button.appendChild(edit_button);
		td_remove_button.appendChild(remove_button);

		Behavior.getBehaviorParameters().push({
			type: new_type,
			name: new_name,
			default: daa.default,
			label: new_name,
			hint: "Sets the " + new_name,
			additional: daa.additional
		});
		let tr = document.createElement("tr");
		tr.id = "db_field_parameter_table_row_" + new_name.replace(' ', '_');
		tr.appendChild(td_type_input_field);
		tr.appendChild(td_name_input_field); // adapt changes on backside name change event
		tr.appendChild(td_edit_button);
		tr.appendChild(td_remove_button);
		document.getElementById("db_parameter_table").appendChild(tr);
		tab_targets = that.updateTabTargets("dashboard");

		document.getElementById("input_db_parameter_type_add").selectedIndex = 0;
		document.getElementById("input_db_parameter_name_add").value = "";
		document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
		document.getElementById("input_db_parameter_name_add").style.backgroundColor = "#fff";

		return true;
	}

	//
	//  Private Functions
	// ===================

	this._addPrivateFunction = function(new_name, new_params, duplicate=false) {
		Behavior.getPrivateFunctions().push({name: new_name, params: new_params});

		let name_input_field = document.createElement("input");
		name_input_field.setAttribute("value", new_name);
		name_input_field.setAttribute("name", new_name);
		name_input_field.setAttribute("class", "inline_function_text_readonly");
		name_input_field.setAttribute("type", "text");
		name_input_field.setAttribute("readonly", "readonly");
		name_input_field.setAttribute("tabindex", "-1"); // Makes the input field unable to receive focus

		if (duplicate) {
			name_input_field.style.backgroundColor = "#f77"; // red flag as invalid
		}

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

		Behavior.getPrivateFunctions().length = 0; // clear existing list
		document.getElementById('db_function_table').innerHTML = "";
		Behavior.setManualCodeFunc(textValue);
		if (func_defs.length > 0) {
			// Update the function list
			func_defs.forEach(function(element, i) {
				that.addPrivateFunction(element.key, element.value); // also updates Behavior.private_functions
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
			return "";
		}

		setTimeout(() => {that.editBoxClicked("Manual Initialization Block",
											  Behavior.getManualCodeInit,
											  acceptFunction, discardFunction);},
					0);

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
			return "";
		}

		setTimeout(() => {that.editBoxClicked("Manual Creation Block",
												Behavior.getManualCodeCreate,
												acceptFunction, discardFunction);},
					0);

	}

	//
	//	State Machine Interface
	// =========================

	this.removeBehaviorOutcome = function(outcome) {
		outcome = outcome.trim();
		let index = Behavior.getInterfaceOutcomes().findIndex(function (element) {
			return element.trim() == outcome.trim(); });
		let childRow = document.getElementById("db_field_outcome_table_row_"+outcome.replace(' ', '_'));
		if (index == -1 || childRow == undefined) {
			console.log(`\x1b[93m removeBehaviorOutcome - unknown entry (${index}) or `
						+`child row (${childRow}) for '${import_value}'\x1b[0m`);
			return;
		}

		Behavior.removeInterfaceOutcome(outcome);
		that.clearChildElements("db_field_outcome_table_remove_button_"+outcome.replace(' ', '_'));
		that.clearChildElements("db_field_outcome_table_input_field_" + outcome.replace(' ', '_'));
		document.getElementById("db_outcome_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("db_outcome_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Removed behavior outcome " + outcome,
			function() { that.addBehaviorOutcome(outcome); },
			function() { that.removeBehaviorOutcome(outcome); }
		);

		if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
	};


	this.changeBehaviorOutcome = async function(new_value, old_value) {

		new_value = new_value.trim();
		old_value = old_value.trim();

		if (new_value == old_value) {
			console.log(`Ignoring changeBehaviorOutcome for '${old_value}' with no change`);
			return false;
		}

		let index = Behavior.getInterfaceOutcomes().findIndex((el) => { return el == old_value});
		let keyElement = document.getElementById('db_field_outcome_table_input_field_' + old_value.replace(' ', '_'));
		if (index == -1 || keyElement == undefined) {
			console.log(`\x1b[93m changeBehaviorOutcome - unknown entry (${index}) or key element (${keyElement}) for '${old_value}'\x1b[0m`);
			console.log(`    ${JSON.stringify(Behavior.getInterfaceOutcomes())}`);
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // Red background color
			}
			return false;
		}

		let match = Behavior.getInterfaceOutcomes().findIndex((el, ndx) => {
			return el === new_value && ndx != index;
		});
		if (match != -1) {
			console.log(`Cannot not use a duplicate outcome! ('${new_value}' in '${keyElement.id}')  (active='${document.activeElement.id}')`);
			await UI.Tools.customAcknowledge("Duplicate outcomes are not allowed.<br><br>Select button to continue.")
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // Red background color
			return false;
		}

		Behavior.updateInterfaceOutcome(old_value, new_value);
		keyElement.setAttribute("old_value", new_value);
		keyElement.value = new_value;
		keyElement.style.backgroundColor = "#fff";
		keyElement.id = "db_field_outcome_table_input_field_" + new_value.replace(' ', '_');

		// Update the other element ids with new key value
		let variableRow = document.getElementById("db_field_outcome_table_row_" + old_value.replace(' ', '_'));
		variableRow.id = "db_field_outcome_table_row_" + new_value.replace(' ', '_');
		let removeElement = document.getElementById("db_field_outcome_table_remove_button_" + old_value.replace(' ', '_'));
		removeElement.id = "db_field_outcome_table_remove_button_" + new_value.replace(' ', '_');


		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Modified outcome name '" + old_value + "' to '" + new_value + "'",
			function() { that.changeBehaviorOutcome(old_value, new_value); },
			function() { that.changeBehaviorOutcome(new_value, old_value); }
		);

		if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();

		return true;
	};

	this._addBehaviorOutcome = function(new_outcome) {
		new_outcome = new_outcome.trim();

		const new_id = new_outcome.replace(' ', '_');

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_outcome_table_input_field_"+new_id);
		input_field.setAttribute("value", new_outcome);
		input_field.setAttribute("old_value", new_outcome);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");
		const outcomeBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let new_value = input_field.value.trim();
			let old_value = input_field.getAttribute("old_value");
			input_field.style.backgroundColor = "#fff"; // clear any error flag
			if (old_value === new_value) return;  // no change

			setTimeout(() => {that.changeBehaviorOutcome(new_value, old_value)}, 0);
		};
		input_field.addEventListener("blur", outcomeBlurHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'blur', 'handler': outcomeBlurHandler});

		const enterHandler = function(event) {
			if (event.key === "Enter") {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				let new_value = input_field.value.trim();
				let old_value = input_field.getAttribute("old_value");
				input_field.style.backgroundColor = "#fff"; // clear any error flag
				if (old_value === new_value) return;  // no change

				setTimeout(() => {that.changeBehaviorOutcome(new_value, old_value)}, 0);
				}
		};
		input_field.addEventListener("keydown", enterHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'keydown', 'handler': enterHandler});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_outcome_table_remove_button_" + new_id);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from outcomes");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		remove_button.setAttribute("tabindex", "0");

		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let outcome = input_field.getAttribute("old_value").trim();
			setTimeout(() => {that.removeBehaviorOutcome(outcome)}, 0);
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

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);

		Behavior.addInterfaceOutcome(new_outcome);

		let tr = document.createElement("tr");
		tr.id = "db_field_outcome_table_row_"+new_outcome.replace(' ', '_')
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_outcome_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior outcome " + new_outcome,
			function() { that.removeBehaviorOutcome(new_outcome); },
			function() { that.addBehaviorOutcome(new_outcome); }
		);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_outcome_add").value = "";
		document.getElementById("input_db_outcome_add").focus({preventScroll: true});

		if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();

	}

	this.removeInterfaceInputKey = function(key) {
		let index = Behavior.getInterfaceInputKeys().findIndex((el) => { return el == key});
		let childRow = document.getElementById("db_field_input_key_table_row_" + key.replace(' ', '_'));
		if (index == -1 || childRow == undefined) {
			console.log(`\x1b[93m removeInterfaceInputKey - unknown entry (${index}) or child row (${childRow}) for '${key}'\x1b[0m`);
			return false;
		}

		Behavior.removeInterfaceInputKey(key);
		that.clearChildElements("db_field_input_key_table_remove_button_" + key.replace(' ', '_'));
		that.clearChildElements("db_field_input_key_table_input_field_" + key.replace(' ', '_'));
		document.getElementById("db_input_key_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_input_key_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Removed behavior input key " + key,
			function() { that.addInterfaceInputKey(key); },
			function() { that.removeInterfaceInputKey(key); }
		);

		return true;
	};


	this.changeInterfaceInputKey = async function(new_key, old_key) {
		new_key = new_key.trim();
		old_key = old_key.trim();

		if (new_key == old_key) {
			console.log(`Ignoring changeInterfaceInputKey for '${old_key}' with no change`);
			return false;
		}

		const index = Behavior.getInterfaceInputKeys().findIndex((el) => { return el == old_key});
		let keyElement = document.getElementById('db_field_input_key_table_input_field_' + old_key.replace(' ', '_'));
		if (index == -1 || keyElement == undefined) {
			console.log(`\x1b[93m changeInterfaceInputKey - unknown entry (${index}) or key element (${keyElement}) for '${old_key}'\x1b[0m`);
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // Red background color
			}
			return false;
		}

		let existing = Behavior.getInterfaceInputKeys().findIndex((el, ndx) => { return el == new_key && ndx != index});
		if (existing != -1) {
			console.log(`Key name '${new_key}' already exists (${keyElement.id})!`);
			await UI.Tools.customAcknowledge(`Key name '${new_key}' already exists!<br><br>`
											+`Select button to continue.`);
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // Red background color
			return false;
		}

		Behavior.updateInterfaceInputKeys(old_key, new_key);
		keyElement.setAttribute("old_value", new_key);
		keyElement.value = new_key;
		keyElement.style.backgroundColor = "#fff";

		// Update the other element ids with new key value
		const old_id = old_key.replace(' ', '_');
		const new_id = new_key.replace(' ', '_');
		keyElement.id = 'db_field_input_key_table_input_field_' + new_id;

		let variableRow = document.getElementById("db_field_input_key_table_row_" + old_id);
		variableRow.id = "db_field_input_key_table_row_" + new_id;

		let removeElement = document.getElementById("db_field_input_key_table_remove_button_" + old_id);
		removeElement.id = "db_field_input_key_table_remove_button_" + new_id;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Renamed input key '" + old_key + "' to '" + new_key + "'",
			function() { that.changeInterfaceInputKey(old_key, new_key)},
			function() { that.changeInterfaceInputKey(new_key, old_key)}
		);

		if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();

		return true;
	};

	this._addInterfaceInputKey = function(new_key) {
		const new_id = new_key.replace(' ', '_');

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_input_key_table_input_field_"+new_id);
		input_field.setAttribute("value", new_key);
		input_field.setAttribute("old_value", new_key);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");

		const inputKeyBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let new_value = input_field.value.trim();
			let old_value = input_field.getAttribute("old_value");
			input_field.style.backgroundColor = "#fff"; // clear any error flag
			if (old_value === new_value) return;  // no change

			setTimeout(() => {that.changeInterfaceInputKey(new_value, old_value)}, 0);
		};

		input_field.addEventListener("blur", inputKeyBlurHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'blur', 'handler': inputKeyBlurHandler});

		const enterHandler = function(event) {
			if (event.key === "Enter") {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				let new_value = input_field.value.trim();
				let old_value = input_field.getAttribute("old_value");
				input_field.style.backgroundColor = "#fff"; // clear any error flag
				if (old_value === new_value) return;  // no change

				setTimeout(() => {that.changeInterfaceInputKey(new_value, old_value)}, 0);
				}
		};
		input_field.addEventListener("keydown", enterHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'keydown', 'handler': enterHandler});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_input_key_table_remove_button_" + new_id);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from input keys");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = input_field.getAttribute("old_value").trim();
			setTimeout(() => {that.removeInterfaceInputKey(key)}, 0);
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

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);

		let tr = document.createElement("tr");
		tr.id = "db_field_input_key_table_row_" + new_id
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_input_key_table").appendChild(tr);

		Behavior.addInterfaceInputKey(new_key);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior input key " + new_key,
			function() { that.removeInterfaceInputKey(new_key); },
			function() { that.addInterfaceInputKey(new_key); }
		);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_input_key_add").value = "";
		document.getElementById("input_db_input_key_add").focus({preventScroll: true});
	}

	this.removeInterfaceOutputKey = function(key) {
		let index = Behavior.getInterfaceOutputKeys().findIndex((el) => { return el == key});
		let childRow = document.getElementById("db_field_output_key_table_row_" + key.replace(' ', '_'));
		if (index == -1 || childRow == undefined) {
			console.log(`\x1b[93m removeInterfaceOutputKey - unknown entry (${index}) or child row (${childRow}) for '${key}'\x1b[0m`);
			return false;
		}

		Behavior.removeInterfaceOutputKey(key);
		that.clearChildElements("db_field_output_key_table_remove_button_" + key.replace(' ', '_'));
		that.clearChildElements("db_field_output_key_table_input_field_" + key.replace(' ', '_'));
		document.getElementById("db_output_key_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_output_key_table").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Removed behavior output key " + key,
			function() { that.addInterfaceOutputKey(key); },
			function() { that.removeInterfaceOutputKey(key); }
		);
		return true;
	};

	this.changeInterfaceOutputKey = async function(new_key, old_key) {
		new_key = new_key.trim();
		old_key = old_key.trim();

		if (new_key == old_key) {
			console.log(`Ignoring changeInterfaceOutputKey for '${old_key}' with no change`);
			return false;
		}

		const index = Behavior.getInterfaceOutputKeys().findIndex((el) => { return el == old_key});
		let keyElement = document.getElementById('db_field_output_key_table_input_field_' + old_key.replace(' ', '_'));
		if (index == -1 || keyElement == undefined) {
			console.log(`\x1b[93m changeInterfaceOutputKey - unknown entry (${index}) or key element (${keyElement}) for '${old_key}'\x1b[0m`);
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // Red background color
			}
			return false;
		}

		let existing = Behavior.getInterfaceOutputKeys().findIndex((el, ndx) => { return el == new_key && ndx != index});
		if (existing != -1) {
			console.log(`Key name '${new_key}' already exists!`);
			await UI.Tools.customAcknowledge(`Key name '${new_key}' already exists!<br><br>`
											+`Select button to continue.`)
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // Red background color
			return false;
		}

		const old_id = old_key.replace(' ', '_');
		const new_id = new_key.replace(' ', '_');

		Behavior.updateInterfaceOutputKeys(old_key, new_key);
		keyElement.setAttribute("old_value", new_key);
		keyElement.value = new_key;
		keyElement.style.backgroundColor = "#fff";
		keyElement.id = "db_field_output_key_table_input_field_" + new_id;

		// Update the other element ids with new key value
		keyElement.id = 'db_field_output_key_table_input_field_' + new_id;

		let variableRow = document.getElementById("db_field_output_key_table_row_" + old_id);
		variableRow.id = "db_field_output_key_table_row_" + new_id;

		let removeElement = document.getElementById("db_field_output_key_table_remove_button_" + old_id);
		removeElement.id = "db_field_output_key_table_remove_button_" + new_id;

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Renamed behavior output key '" + old_key + "' to '" + new_key + "'",
			function() { that.changeInterfaceOutputKey(old_key, new_key)},
			function() { that.changeInterfaceOutputKey(new_key, old_key)});

		if (UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();

		return true;
	};


	this._addInterfaceOutputKey = function(new_key) {

		const new_id = new_key.replace(' ', '_');

		let input_field = document.createElement("input");
		input_field.setAttribute("id", "db_field_output_key_table_input_field_"+new_id);
		input_field.setAttribute("value", new_key);
		input_field.setAttribute("old_value", new_key);
		input_field.setAttribute("class", "inline_text_edit");
		input_field.setAttribute("type", "text");
		const outputKeyBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let new_value = input_field.value;
			let old_value = input_field.getAttribute("old_value");
			input_field.style.backgroundColor = "#fff"; // clear any error flag
			if (new_value === old_value) return;

			setTimeout(() => {that.changeInterfaceOutputKey(new_value, old_value)}, 0);
		};
		input_field.addEventListener("blur", outputKeyBlurHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'blur', 'handler': outputKeyBlurHandler});

		const enterHandler = function(event) {
			if (event.key === "Enter") {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				let new_value = input_field.value.trim();
				let old_value = input_field.getAttribute("old_value");
				input_field.style.backgroundColor = "#fff"; // clear any error flag
				if (old_value === new_value) return;  // no change

				setTimeout(() => {that.changeInterfaceOutputKey(new_value, old_value)}, 0);
				}
		};
		input_field.addEventListener("keydown", enterHandler);
		listeners_to_cleanup.push({'element': input_field, 'listener_type': 'keydown', 'handler': enterHandler});


		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_output_key_table_remove_button_" + new_id);
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove from output keys");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");

		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let key = input_field.getAttribute("old_value");
			setTimeout(() => {that.removeInterfaceOutputKey(key)}, 0);

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

		let td_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_input_field.appendChild(input_field);
		td_remove_button.appendChild(remove_button);

		Behavior.addInterfaceOutputKey(new_key);

		let tr = document.createElement("tr");
		tr.id = "db_field_output_key_table_row_" + new_id
		tr.appendChild(td_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_output_key_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE,
			"Added behavior output key " + new_key,
			function() { removeFunction(new_key); },
			function() { addFunction(new_key); }
		);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_output_key_add").value = "";
		document.getElementById("input_db_output_key_add").focus({preventScroll: true});
	}

	this.createBehaviorParameterEdit = function(param_name) {
		let param = Behavior.getBehaviorParameters().findElement(function(element) {
			return element.name == param_name;
		});

		let turn_button = document.getElementById('db_parameter_edit_table_turn_button');
		turn_button.addEventListener('click', UI.Dashboard.turnParameterClicked);
		listeners_to_cleanup.push({'element': turn_button, 'listener_type': 'click', 'handler': UI.Dashboard.turnParameterClicked});

		const turnHandler = function(event) {
			if (event.key === "Enter" || event.key === ' ') {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				UI.Dashboard.turnParameterClicked(event);
			}
		};
		turn_button.addEventListener("keydown", turnHandler);
		listeners_to_cleanup.push({'element': turn_button, 'listener_type': 'keydown', 'handler': turnHandler});

		let value_input_field = document.createElement("input"); // define early to have in handlers
		let additional_tr = document.createElement("tr");
		additional_tr.setAttribute("id", "db_field_parameter_edit_table_additional_row");
		additional_tr.setAttribute("name", param_name);
		let type_input_field = document.createElement("select");
		type_input_field.innerHTML = '<option value="enum"' + (param.type == "enum"? ' selected="selected"' : '') + '>Enum</option>' +
							'<option value="numeric"' + (param.type == "numeric"? ' selected="selected"' : '') + '>Numeric</option>' +
							'<option value="boolean"' + (param.type == "boolean"? ' selected="selected"' : '') + '>Boolean</option>' +
							'<option value="text"' + (param.type == "text"? ' selected="selected"' : '') + '>Text</option>' +
							'<option value="yaml"' + (param.type == "yaml"? ' selected="selected"' : '') + '>File</option>';
		type_input_field.setAttribute("id", "db_field_parameter_edit_table_type_input");
		type_input_field.setAttribute("name", param_name);
		type_input_field.setAttribute("class", "input_field");
		const changeTypeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let name = type_input_field.getAttribute("name");
			let type = type_input_field.options[type_input_field.selectedIndex].value;

			let param = Behavior.getBehaviorParameterElement(name);
			if (param == undefined) {
				console.log(`\x1b[93m Invalid parameter '${name}' - parameter does not exist for this behavior! (?)\x1b[0m`);
				return;
			}
			if (type === param.type) return;

			let daa = getDefaultAndAdditional(type);

			Behavior.updateBehaviorParameter(name, type, "type");
			Behavior.updateBehaviorParameter(name, daa.default, "default");
			Behavior.updateBehaviorParameter(name, daa.additional, "additional");

			switch (type){
				case "text":
					value_input_field.style.backgroundColor = "#7CFC00"; // lawn green for text
					break;
				case "enum":
					value_input_field.style.backgroundColor = "#F08080"; // light coral for enum
					break;
				default:
					value_input_field.style.backgroundColor = "#FFEBCD"; // blanched almond for primitives
			}

			// update input fields
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
			additional_td.appendChild(that.createParameterAdditionalEdit(name, additional_tr));
		};
		type_input_field.addEventListener("change", changeTypeHandler);
		listeners_to_cleanup.push({'element': type_input_field, 'listener_type': 'change', 'handler': changeTypeHandler});

		let label_label = document.createElement("label");
		label_label.innerHTML = "Label: ";
		let label_input_field = document.createElement("input");
		label_input_field.setAttribute("id", "db_field_parameter_edit_table_label_input");
		label_input_field.setAttribute("value", param.label);
		label_input_field.setAttribute("name", param_name);
		label_input_field.setAttribute("class", "input_field");
		label_input_field.setAttribute("type", "text");
		const labelBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let name = label_input_field.getAttribute("name");
			Behavior.updateBehaviorParameter(name, label_input_field.value, "label");
		};
		label_input_field.addEventListener("blur", labelBlurHandler);
		listeners_to_cleanup.push({'element': label_input_field, 'listener_type': 'blur', 'handler': labelBlurHandler});

		const labelEnterHandler = function(event) {
			if (event.key === "Enter") {
				labelBlurHandler(event);
			}
		};
		label_input_field.addEventListener("keydown", labelEnterHandler);
		listeners_to_cleanup.push({'element': label_input_field, 'listener_type': 'keydown', 'handler': labelEnterHandler});

		let hint_label = document.createElement("label");
		hint_label.innerHTML = "Advice for the operator: ";
		let hint_input_field = document.createElement("input");
		hint_input_field.setAttribute("id", "db_field_parameter_edit_table_hint_input");
		hint_input_field.setAttribute("value", param.hint);
		hint_input_field.setAttribute("name", param_name);
		hint_input_field.setAttribute("class", "input_field");
		hint_input_field.setAttribute("type", "text");
		const hintBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let name = hint_input_field.getAttribute("name");
			Behavior.updateBehaviorParameter(name, hint_input_field.value, "hint");
		};
		hint_input_field.addEventListener("blur", hintBlurHandler);
		listeners_to_cleanup.push({'element': hint_input_field, 'listener_type': 'blur', 'handler': hintBlurHandler});

		const hintEnterHandler = function(event) {
			if (event.key === "Enter") {
				hintBlurHandler(event);
			}
		};
		hint_input_field.addEventListener("keydown", hintEnterHandler);
		listeners_to_cleanup.push({'element': hint_input_field, 'listener_type': 'keydown', 'handler': hintEnterHandler});


		let name_input_field = document.createElement("input");
		name_input_field.setAttribute("id", "db_field_parameter_edit_table_name_input");
		name_input_field.setAttribute("value", param_name);
		name_input_field.setAttribute("name", param_name);
		name_input_field.setAttribute("class", "inline_text_edit");
		name_input_field.setAttribute("type", "text");
		const nameBlurHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let old_name = name_input_field.getAttribute("name");
			let new_name = name_input_field.value.trim();
			if (old_name == new_name) return;

			setTimeout(() => {
				if (that.changeBehaviorParameterName(new_name, old_name)) {
					type_input_field.name = new_name;
					name_input_field.name = new_name;
					hint_input_field.name = new_name;
					label_input_field.name = new_name;
					value_input_field.name = new_name;
					additional_tr.setAttribute("name", new_name); // row does not normally have name so use setAttr

					let entry = Behavior.getBehaviorParameterElement(new_name);
					hint_input_field.value = entry.hint;
					label_input_field.value = entry.label;

				} else {
					console.log(`\x1b[93mParameter name change '${new_name}' was rejected! \x1b[0m`);
					name_input_field.value = old_name;
				}
			}, 0);
		};
		name_input_field.addEventListener("blur", nameBlurHandler);
		listeners_to_cleanup.push({'element': hint_input_field, 'listener_type': 'blur', 'handler': nameBlurHandler});

		const nameEnterHandler = function(event) {
			if (event.key === "Enter") {
				nameBlurHandler(event);
			}
		};
		name_input_field.addEventListener("keydown", nameEnterHandler);
		listeners_to_cleanup.push({'element': name_input_field, 'listener_type': 'keydown', 'handler': nameEnterHandler});

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
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
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

		const valueEnterHandler = function(event) {
			if (event.key === "Enter") {
				valueBlurHandler(event);
			}
		};
		value_input_field.addEventListener("keydown", valueEnterHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'keydown', 'handler': valueEnterHandler});

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
		add_td.appendChild(that.createParameterAdditionalEdit(param_name, additional_tr));

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

	this.createParameterAdditionalEdit = function(param_name, tr) {
		let param = Behavior.getBehaviorParameters().findElement(function(element) {
			return element.name == param_name;
		});
		let type = param.type;

		if (type == "enum") {
			let add_input = document.createElement("input");
			add_input.setAttribute("id", "db_field_parameter_edit_table_add_input");
			add_input.setAttribute("class", "input_field");
			add_input.setAttribute("type", "text");
			add_input.setAttribute("tabindex", "0");

			let add_button = document.createElement("input");
			add_button.setAttribute("id", "db_field_parameter_edit_table_add_button");
			add_button.setAttribute("value", "Add");
			add_button.setAttribute("type", "button");
			add_button.setAttribute("tabindex", "0");

			const addButtonHandler = function(event) {
				event.preventDefault();
				event.stopPropagation();
				let name = tr.getAttribute("name"); // name assigned by row
				let to_add = add_button.parentNode.parentNode.children[1].children[0].value;
				add_button.parentNode.parentNode.children[1].children[0].value = "";
				let entry = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				});

				if (entry.additional.indexOf(to_add) != -1 || to_add == "") return;
				additional.push(to_add);
				Behavior.updateBehaviorParameter(name, entry.additional, "additional");

				// update remove list
				let select = add_button.parentNode.parentNode.children[4].children[0];
				select.innerHTML = '';
				for (let i = 0; i < additional.length; i++) {
					select.innerHTML += '<option value="' + entry.additional[i] + '">' + entry.additional[i] + '</option>';
				};

				// update default value
				let default_field = add_button.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (additional.length == 1) {
					default_field.value = to_add;
					Behavior.updateBehaviorParameter(name, to_add, "default");
				}
			};
			add_button.addEventListener("click", addButtonHandler);
			listeners_to_cleanup.push({'element': add_button, 'listener_type': 'click', 'handler': addButtonHandler});

			const onEnterAdd = function(event) {
				if (event.key === 'Enter' || event.key === ' ') {
					addButtonHandler(event);
				}
			}
			add_button.addEventListener("keydown", onEnterAdd);
			listeners_to_cleanup.push({'element': add_button, 'listener_type': 'keydown', 'handler': onEnterAdd});

			let remove_input = document.createElement("select");
			remove_input.innerHTML = '';
			for (let i = 0; i < param.additional.length; i++) {
				remove_input.innerHTML += '<option value="' + param.additional[i] + '">' + param.additional[i] + '</option>';
			};
			remove_input.setAttribute("id", "db_field_parameter_edit_table_remove_input");
			remove_input.setAttribute("class", "input_field");
			remove_input.setAttribute("style", "min-width: 80px");
			remove_input.setAttribute("type", "text");
			remove_input.setAttribute("tabindex", "0");

			let remove_button = document.createElement("input");
			remove_button.setAttribute("id", "db_field_parameter_edit_table_remove_button");
			remove_button.setAttribute("value", "Remove");
			remove_button.setAttribute("name", param_name);
			remove_button.setAttribute("type", "button");
			remove_button.setAttribute("tabindex", "0");
			const removeButtonHandler =  function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				let name = tr.getAttribute("name"); // name assigned by row

				let select = remove_button.parentNode.parentNode.children[4].children[0];
				let to_remove = select.options[select.selectedIndex].value;
				if (to_remove == "") return;
				let entry = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				});

				entry.additional.remove(to_remove);
				Behavior.updateBehaviorParameter(name, entry.additional, "additional");

				// update remove list
				select.innerHTML = '';
				for (let i = 0; i < entry.additional.length; i++) {
					select.innerHTML += '<option value="' + entry.additional[i] + '">' + entry.additional[i] + '</option>';
				};

				// update default value
				let default_field = remove_button.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (additional.length == 0) {
					default_field.value = "";
					Behavior.updateBehaviorParameter(name, "", "default");
				} else if (to_remove == default_field.value) {
					default_field.value = entry.additional[0];
					Behavior.updateBehaviorParameter(name, entry.additional[0], "default");
				}

				that.clearChildElements("db_field_parameter_edit_table_", false);
			};
			remove_button.addEventListener("click", removeButtonHandler);
			listeners_to_cleanup.push({'element': remove_button, 'listener_type': 'click', 'handler': removeButtonHandler});

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
			min_input.setAttribute("id", "db_field_parameter_edit_table_min_input");
			min_input.setAttribute("value", param.additional.min);
			min_input.setAttribute("name", param_name);
			min_input.setAttribute("class", "input_field");
			min_input.setAttribute("type", "text");
			min_input.setAttribute("tabindex", "0");
			const minBlurHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				let name = tr.getAttribute("name"); // name assigned by row

				if (min_input.value.match(/^-?[0-9]+(\.[0-9]+)?$/i) == undefined) return;

				let entry = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				});

				if (parseFloat(min_input.value) > parseFloat(entry.additional.max)) min_input.value = entry.additional.max;
				entry.additional.min = min_input.value;
				Behavior.updateBehaviorParameter(name, entry.additional, "additional");

				// update default value
				let default_field = min_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (parseFloat(default_field.value) < parseFloat(min_input.value)) {
					default_field.value = min_input.value;
					Behavior.updateBehaviorParameter(name, min_input.value, "default");
				}
			};
			min_input.addEventListener("blur", minBlurHandler);
			listeners_to_cleanup.push({'element': min_input, 'listener_type': 'blur', 'handler': minBlurHandler});

			const minEnterHandler = function(event) {
				if (event.key === "Enter") {
					minBlurHandler(event);
				}
			};
			min_input.addEventListener("keydown", minEnterHandler);
			listeners_to_cleanup.push({'element': min_input, 'listener_type': 'keydown', 'handler': minEnterHandler});

			let max_input = document.createElement("input");
			max_input.setAttribute("id", "db_field_parameter_edit_table_max_input");
			max_input.setAttribute("value", param.additional.max);
			max_input.setAttribute("name", param_name);
			max_input.setAttribute("class", "input_field");
			max_input.setAttribute("type", "text");
			max_input.setAttribute("tabindex", "0");
			const maxBlurHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				let name = tr.getAttribute("name"); // name assigned by row
				if (max_input.value.match(/^-?[0-9]+(\.[0-9]+)?$/i) == undefined) return;

				let entry = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				});

				if (parseFloat(max_input.value) < parseFloat(entry.additional.min)) max_input.value = entry.additional.min;
				entry.additional.max = max_input.value;
				Behavior.updateBehaviorParameter(name, entry.additional, "additional");

				// update default value
				let default_field = max_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[3].children[2].children[0];
				if (parseFloat(default_field.value) > parseFloat(max_input.value)) {
					default_field.value = max_input.value;
					Behavior.updateBehaviorParameter(name, max_input.value, "default");
				}
			};

			max_input.addEventListener("blur", maxBlurHandler);
			listeners_to_cleanup.push({'element': max_input, 'listener_type': 'blur', 'handler': maxBlurHandler});

			const maxEnterHandler = function(event) {
				if (event.key === "Enter") {
					maxBlurHandler(event);
				}
			};
			max_input.addEventListener("keydown", maxEnterHandler);
			listeners_to_cleanup.push({'element': max_input, 'listener_type': 'keydown', 'handler': maxEnterHandler});

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
			key_input.setAttribute("id", "db_field_parameter_edit_table_key_input");
			key_input.setAttribute("value", param.additional.key);
			key_input.setAttribute("name", param_name);
			key_input.setAttribute("class", "input_field");
			key_input.setAttribute("type", "text");
			key_input.setAttribute("tabindex", "0");

			const keyInputBlurHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers

				let name = tr.getAttribute("name"); // name assigned by row

				let entry = Behavior.getBehaviorParameters().findElement(function(element) {
					return element.name == name;
				});
				entry.additional.key = key_input.value;
				Behavior.updateBehaviorParameter(name, entry.additional, "additional");
			};
			key_input.addEventListener("blur", keyInputHandler);
			listeners_to_cleanup.push({'element': key_input, 'listener_type': 'blur', 'handler': keyInputBlurHandler});

			const keyInputEnterHandler = function(event) {
				if (event.key === "Enter") {
					keyInputBlurHandler(event);
				}
			};
			max_input.addEventListener("keydown", keyInputEnterHandler);
			listeners_to_cleanup.push({'element': key_input, 'listener_type': 'keydown', 'handler': keyInputEnterHandler});


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

		if (new_key == '') {
			console.log(`Must define both key and value before adding private variable!`);
			await UI.Tools.customAcknowledge("Must define both key and value before adding!<br><br>"
											+"Select button to continue.");
			document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
			return false;
		}

		let privateVariables = Behavior.getPrivateVariables();
		let match = privateVariables.find((element) => {return element.key === new_key;});

		if  (match != undefined) {
			console.log(`Cannot not add duplicate key to private variables!`);
			await UI.Tools.customAcknowledge("Duplicate keys are not allowed.<br><br>Select button to continue.")
			document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
			document.getElementById("input_db_variable_key_add").style.backgroundColor = "#f77";
			return false;
		}

		if (new_value === '') {
			console.log(`Must define both key and value before adding private variable!`);
			await UI.Tools.customAcknowledge("Must define both key and value before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_variable_value_add").focus({ preventScroll: true });
			return false;
		}

		if (!Checking.isValidPythonVarname(new_key)) {
			console.log(`Key must be a valid Python variable!`);
			await UI.Tools.customAcknowledge("Key must be a valid Python variable!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_variable_key_add").focus({ preventScroll: true });
			document.getElementById("input_db_variable_key_add").style.backgroundColor = "#f77";
			return;
		}

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
		let match = userData.find((element) => {return element.key === new_key;});
		if  (match != undefined) {
			console.log(`Cannot not add duplicate key to user data!`);
			await UI.Tools.customAcknowledge("Duplicate keys in userdata are not allowed.<br><br>Select button to continue.")
			document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
			return false;
		}

		if (new_key == '') {
			console.log(`Must define both key and value for userdata before adding!`);
			await UI.Tools.customAcknowledge("Must define both key and value for userdata before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
			return false;
		}

		if (!Checking.isValidPythonVarname(new_key)) {
			console.log(`Userdata should be a valid Python variable (not '${new_key}') to allow access via dot operator!`);
			await UI.Tools.customAcknowledge("Key should be a valid Python variable<br>"
											+"to allow access via dot operator!<br>"
											+"Select any button to continue.");
			document.getElementById("input_db_userdata_key_add").focus({ preventScroll: true });
			return false;
		}

		if (new_value === '') {
			console.log(`Must define both key and value for userdata before adding!`);
			await UI.Tools.customAcknowledge("Must define both key and value for userdata before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_userdata_value_add").focus({ preventScroll: true });
			return false;
		}

		return that._addDefaultUserdata(new_key, new_value);
	}

	this.addDefaultUserdataClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_key = document.getElementById("input_db_userdata_key_add").value.trim();
		let new_value = document.getElementById("input_db_userdata_value_add").value.trim();
		await that.addDefaultUserdata(new_key, new_value);
	}

	this.addParameter = async function(new_type, new_name) {

		if (new_type == undefined || new_type == '') {
			console.log(`Must define both type and name for parameter before adding!`);
			await UI.Tools.customAcknowledge("Must define both type and name for parameter before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_parameter_type_add").focus({ preventScroll: true });
			return false;
		}

		if (new_name == undefined || new_name === '') {
			console.log(`Must define both type and name for parameter before adding!`);
			await UI.Tools.customAcknowledge("Must define both type and name for parameter before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			return false;
		}

		let existing = Behavior.getBehaviorParameterElement(new_name);
		if (existing != undefined) {
			console.log(`Parameter name '${new_name}' already exists!`);
			await UI.Tools.customAcknowledge(`Parameter name '${new_name}' already exists!<br><br>`
											+`Select button to continue.`)
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			document.getElementById("input_db_parameter_name_add").style.backgroundColor = "#f77";
			return false;
		}

		if (!Checking.isValidPythonVarname(new_name)) {
			console.log(`Parameter name must be a valid Python variable (not '${new_name}')!`);
			await UI.Tools.customAcknowledge("Parameter name must be a valid Python variable!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_parameter_name_add").focus({ preventScroll: true });
			document.getElementById("input_db_parameter_name_add").style.backgroundColor = "#f77";
			return;
		}


		return that._addBehaviorParameter(new_type, new_name);
	}
	this.addParameterClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let type_select = document.getElementById("input_db_parameter_type_add");
		let new_name = document.getElementById("input_db_parameter_name_add").value.trim();
		return await that.addParameter(type_select.options[type_select.selectedIndex].value, new_name);
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

	this.addPrivateFunction = async function(new_name, new_params) {
		const funcs = Behavior.getPrivateFunctions();
		let entry = funcs.find((el) => {return el.name == new_name});
		if (entry != undefined) {
			console.log(`Duplicate function names (${new_name}) are not allowed!`);
			await UI.Tools.customAcknowledge(`Duplicate function names (${new_name}) are not allowed!<br>`
											+`Edit the manual code and correct!<br>`
											+`Select any button to continue.`);
			// continue processing and highlight errors in color
		}

		return that._addPrivateFunction(new_name, new_params, entry != undefined);
	}

	this.addBehaviorOutcome = async function(new_outcome) {

		if (new_outcome == undefined || new_outcome == '') {
			console.log(`Must define outcome before adding!`);
			await UI.Tools.customAcknowledge("Must define valid outcome before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_outcome_add").focus({ preventScroll: true });
			return false;
		}

		let existing = Behavior.getInterfaceOutcomes().findIndex((el) => { return el == new_outcome});
		if (existing != -1) {
			console.log(`\x1b[93mOutcome name '${new_outcome}' (${existing}) already exists!\x1b[0m`);
			await UI.Tools.customAcknowledge(`Outcome name '${new_outcome}' already exists!<br><br>`
											+`Select button to continue.`)
			document.getElementById("input_db_outcome_add").focus({ preventScroll: true });
			return false;
		}

		return that._addBehaviorOutcome(new_outcome);
	}

	this.addBehaviorOutcomeClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_outcome = document.getElementById("input_db_outcome_add").value.trim();
		return await that.addBehaviorOutcome(new_outcome);
	}

	this.addInterfaceInputKey = async function(new_key) {
		if (new_key == undefined || new_key == '') {
			console.log(`Must define key before adding!`);
			await UI.Tools.customAcknowledge("Must define valid key before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_input_key_add").focus({ preventScroll: true });
			return false;
		}

		const index = Behavior.getInterfaceInputKeys().findIndex((el) => { return el == new_key});
		if (index != -1) {
			console.log(`Input key '${new_key}' already exists!`);
			await UI.Tools.customAcknowledge(`Input key '${new_key}' already exists!<br><br>`
											+`Select button to continue.`)
			document.getElementById("input_db_input_key_add").focus({ preventScroll: true });
			return false;
		}
		return that._addInterfaceInputKey(new_key);
	}

	this.addInterfaceInputKeyClicked = function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_key = document.getElementById("input_db_input_key_add").value.trim();
		that.addInterfaceInputKey(new_key);
	}

	this.addInterfaceOutputKey = async function(new_key) {
		if (new_key == undefined || new_key == '') {
			console.log(`Must define key before adding!`);
			await UI.Tools.customAcknowledge("Must define valid key before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_output_key_add").focus({ preventScroll: true });
			return false;
		}

		const index = Behavior.getInterfaceOutputKeys().findIndex((el) => { return el == new_key});
		if (index != -1) {
			console.log(`Output key '${new_key}' already exists!`);
			await UI.Tools.customAcknowledge(`Output key '${new_key}' already exists!<br><br>`
											+`Select button to continue.`)
			document.getElementById("input_db_output_key_add").focus({ preventScroll: true });
			return false;
		}
		return that._addInterfaceOutputKey(new_key);
	}

	this.addInterfaceOutputKeyClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_name = document.getElementById("input_db_output_key_add").value.trim();

		return await that.addInterfaceOutputKey(new_name);
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

		// also reset input fields? currently we do not reset input fields

	}

	//
	//  Manual Import Statements
	// =========================

	this.removeManualImport = function(import_value) {
		let index = Behavior.getManualCodeImport().findIndex(function (element) {
			return element.trim() == import_value.trim(); });

		let childRow = document.getElementById("db_field_manual_import_table_row_"+import_value.replace(' ', '_'));
		if (index == -1 || childRow == undefined) {
			console.log(`\x1b[93m removeManualImport - unknown entry (${index}) or `
						+`child row (${childRow}) for '${import_value}'\x1b[0m`);
			return;
		}

		Behavior.getManualCodeImport().splice(index, 1);
		that.clearChildElements("db_manual_import_table_remove_button_"+import_value.replace(' ', '_'));
		that.clearChildElements("db_manual_import_table_input_" + import_value.replace(' ', '_'));
		document.getElementById("db_manual_import_table").removeChild(childRow);
		tab_targets = that.updateTabTargets("dashboard");
		document.getElementById("input_db_manual_import_value_add").focus({ preventScroll: true });

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_REMOVE,
			"Removed manual import '" + import_value + "'",
			function() { that.addManualImport(import_value); },
			function() { that.removeManualImport(import_value); }
		);
	};

	this.changeManualImport = async function(new_value, old_value) {

		new_value = new_value.trim();
		old_value = old_value.trim();
		const old_id = old_value.replace(' ', '_');
		const new_id = new_value.replace(' ', '_');

		if (new_value == old_value) {
			return false;
		}

		let imports = Behavior.getManualCodeImport();
		let index = imports.findIndex(function (el) {return el == old_value; });
		let keyElement = document.getElementById('db_field_manual_import_table_input_' + old_id);
		if (index == -1 || keyElement == undefined) {
			console.log(`\x1b[93m Manual Imports changeManualImport - unknown entry (${index}) or key element (${keyElement}) for '${old_value}'\x1b[0m`);
			if (keyElement != undefined) {
				keyElement.focus({ preventScroll: true });
				keyElement.style.backgroundColor = "#f77"; // Red background color
			}
			return false;
		}

		let match = imports.findIndex((el, ndx) => {return el === new_value && ndx != index;});
		if (match != -1) {
			console.log(`Cannot not use a duplicate import statement! ('${new_value}' in '${keyElement.id}')  (active='${document.activeElement.id}')`);
			await UI.Tools.customAcknowledge("Duplicate imports are not allowed.<br><br>Select button to continue.")
			// leave as wrong value, but don't override to allow reedit - keyElement.value = old_value;
			keyElement.focus({ preventScroll: true });
			keyElement.style.backgroundColor = "#f77"; // Red background color
			return false;
		}

		imports[index] = new_value;
		keyElement.setAttribute("old_value", new_value);
		if (Checking.isValidImportStatement(new_value)) {
			keyElement.style.backgroundColor = "#7CFC00";
		} else {
			console.log(`\x1b[92m Invalid import statement '${new_value}'!\x1b[0m`);
			keyElement.style.backgroundColor = "#FF4500";
		}
		keyElement.value = new_value;
		keyElement.id = "db_field_manual_import_table_input_" + new_id;

		// Update the other element ids with new key value
		let variableRow = document.getElementById("db_field_manual_import_table_row_" + old_id);
		variableRow.id = "db_field_manual_import_table_row_" + new_id;
		let removeElement = document.getElementById("db_field_manual_import_table_remove_button_" + old_id);
		removeElement.id = "db_field_manual_import_table_remove_button_" + new_id;

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE,
			"Modified manual import '" + old_value + "' to '" + new_value + "'",
			function() { that.changeManualImport(old_value, new_value); },
			function() { that.changeManualImport(new_value, old_value); }
		);
		return true;
	};

	this._addManualImport = function(new_value) {
		try {
			let imports = Behavior.getManualCodeImport();
			imports.push(new_value.trim());
		} catch (err) {
			console.log(`cannot add item due to ${err}`);
			return f;
		}

		const new_id = new_value.replace(' ', '_');

		let value_input_field = document.createElement("input");
		value_input_field.setAttribute("id", "db_field_manual_import_table_input_" + new_id);
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
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let old_value = value_input_field.getAttribute("old_value").trim();
			let new_value = value_input_field.value.trim();
			if (Checking.isValidImportStatement(new_value)) {
				value_input_field.style.backgroundColor = "#7CFC00";
			} else {
				console.log(`\x1b[92m Invalid import statement '${new_value}'!\x1b[0m`);
				value_input_field.style.backgroundColor = "#FF4500";
			}
			if (old_value == new_value) return;
			setTimeout(() => {that.changeManualImport(new_value, old_value)}, 0);
		};
		value_input_field.addEventListener("blur", blurHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'blur', 'handler': blurHandler});

		const enterHandler = function(event) {
			if (event.key === "Enter") {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				let old_value = value_input_field.getAttribute("old_value").trim();
				let new_value = value_input_field.value.trim();
				if (old_value == new_value) return;
				setTimeout(() => {that.changeManualImport(new_value, old_value)}, 0);
			}
		};
		value_input_field.addEventListener("keydown", enterHandler);
		listeners_to_cleanup.push({'element': value_input_field, 'listener_type': 'keydown', 'handler': enterHandler});

		let remove_button = document.createElement("img");
		remove_button.setAttribute("id", "db_field_manual_import_table_remove_button_" + new_id)
		remove_button.setAttribute("src", "img/table_row_delete.png");
		remove_button.setAttribute("title", "Remove this import");
		remove_button.setAttribute("class", "img_button");
		remove_button.setAttribute("style", "margin-left: 10px;");
		const removeHandler = function(event) {
			event.preventDefault(); // Prevent default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			let value = value_input_field.getAttribute("old_value");
			setTimeout(() => {that.removeManualImport(value)}, 0);
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

		let td_value_input_field = document.createElement("td");
		let td_remove_button = document.createElement("td");

		td_value_input_field.appendChild(value_input_field);
		td_remove_button.appendChild(remove_button);

		let tr = document.createElement("tr");
		tr.id = "db_field_manual_import_table_row_" + new_id
		tr.appendChild(td_value_input_field);
		tr.appendChild(td_remove_button);
		document.getElementById("db_manual_import_table").appendChild(tr);

		ActivityTracer.addActivity(ActivityTracer.ACT_INTERNAL_CONFIG_ADD,
			`Added manual import '${new_value}'`,
			function() { that.removeManualImport(new_value); },
			function() { that.addManualImport(new_value); }
		);
		tab_targets = that.updateTabTargets("dashboard");

		document.getElementById("input_db_manual_import_value_add").value = "";
		document.getElementById("input_db_manual_import_value_add").focus({preventScroll: true});
		return true;
	}

	this.addManualImport = async function(new_value) {
		if (new_value == undefined || new_value == '') {
			console.log(`Must define import before adding!`);
			await UI.Tools.customAcknowledge("Must define valid import before adding!<br><br>"
											+"Select any button to continue.");
			document.getElementById("input_db_manual_import_value_add").focus({ preventScroll: true });
			return false;
		}

		const imports = Behavior.getManualCodeImport();
		const index = imports.findIndex((el) => { return el == new_value});
		if (index != -1) {
			console.log(`Import statement '${new_value}' already exists! (${document.activeElement.id})`);
			await UI.Tools.customAcknowledge(`Import '${new_value}' already exists!<br><br>`
											+`Select button to continue.`)
			document.getElementById("input_db_manual_import_value_add").focus({ preventScroll: true });
			return false;
		}

		return that._addManualImport(new_value);
	}

	this.addManualImportClicked = async function(event) {
		event.stopPropagation();
		event.preventDefault();
		let new_value = document.getElementById("input_db_manual_import_value_add").value.trim();

		return await that.addManualImport(new_value);
	}

	this.setupTabHandling = function() {
		if (document.activeElement) {
			document.activeElement.blur();
		}
		tab_targets = that.updateTabTargets("dashboard");
		if (tab_targets.length > 0) {
			tab_targets[0].focus({ preventScroll: true });
		}
	}

	this.removeTabHandling = function() {
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
