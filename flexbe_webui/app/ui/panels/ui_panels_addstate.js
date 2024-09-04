UI.Panels.AddState = new (function() {
	var that = this;

	var statelib = [];
	var listeners_to_cleanup = [];

	this.addHoverDetails = function(el, state_def) {
		let details = "<div style='margin-bottom: 0.5em;'>Package: <i>" + state_def.getStatePackage() + "</i></div>";
		let params = state_def.getParameters();
		if (params.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Parameters:";
			params.forEach(param => {
				details += "<br />&nbsp;&nbsp;- " + param;
				let doc = state_def.getParamDesc().findElement(desc => { return desc.name == param; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let input_keys = state_def.getInputKeys().filter(key => !key.startsWith("$"));
		if (input_keys.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Input Keys:";
			input_keys.forEach(key => {
				details += "<br />&nbsp;&nbsp;- " + key;
				let doc = state_def.getInputDesc().findElement(desc => { return desc.name == key; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let output_keys = state_def.getOutputKeys().filter(key => !key.startsWith("$"));
		if (output_keys.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Output Keys:";
			output_keys.forEach(key => {
				details += "<br />&nbsp;&nbsp;- " + key;
				let doc = state_def.getOutputDesc().findElement(desc => { return desc.name == key; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let outcomes = state_def.getOutcomes().filter(outcome => !outcome.startsWith("$"));
		if (outcomes.length > 0) {
			details += "<div style='margin-bottom: 0em;'>Outcomes:";
			outcomes.forEach(outcome => {
				details += "<br />&nbsp;&nbsp;- " + outcome;
			});
			details += "</div>";
		}

		const addHoverHandler = function() {
			let rect = this.getBoundingClientRect();
			let tt = document.createElement("div");
			tt.setAttribute("style", "right: 370px; top: " + rect.top + "px; display: block;");
			tt.setAttribute("class", "sidepanel_tooltip");
			tt.setAttribute("id", "add_state_tooltip");
			tt.innerHTML = details;
			document.getElementsByTagName("body")[0].appendChild(tt);
			if (tt.getBoundingClientRect().bottom >= window.innerHeight - 5) {
				tt.setAttribute("style", "right: 370px; bottom: 5px; display: block;");
			}
		};
		el.addEventListener('mouseover', addHoverHandler);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseover', 'handler': addHoverHandler});

		el.addEventListener('mouseout', that.removeHover);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseout', 'handler': that.removeHover});

	}

	this.removeHover = function() {
		let tt = document.getElementById("add_state_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}
	}

	this.filterClassList = function() {
		that.removeHover();
		that.clearChildElements();
		document.getElementById('panel_class_select').innerHTML = "";
		let filter_exp = document.getElementById("input_class_filter").value.toLowerCase();
		let filter_pkg = document.getElementById("input_package_filter").value;

		let filtered_lib = (filter_pkg == "ALL")?
			statelib :
			statelib.filter(function(element) {
				return WS.Statelib.getFromLib(element).getStatePackage() == filter_pkg;
			});

		let begin_list = filtered_lib.filter(function(element) {
			return element.toLowerCase().indexOf(filter_exp) == 0;
		});
		let contain_list = filtered_lib.filter(function(element) {
			return element.toLowerCase().indexOf(filter_exp) > 0;
		});

		if (filter_exp != filter_exp.toLowerCase()) {
			filter_exp = filter_exp.toLowerCase();
		}

		that.displayStateTypes(begin_list);
		that.displayStateTypes(contain_list);

		if (begin_list.length + contain_list.length == 1) {
			let selected_element;
			if (begin_list.length == 1)
				selected_element = begin_list[0];
			else
				selected_element = contain_list[0];
			document.getElementById("add_state_class").value = selected_element;
		}
		UI.Panels.updatePanelTabTargets(UI.Panels.ADD_STATE_PANEL);
	};

	this.clearChildElements = function(filter='') {

		const elementsToRemove = new Set();
		listeners_to_cleanup.forEach(({element, listener_type, handler}) => {
			if (element.id.startsWith(filter)) {
				element.removeEventListener(listener_type, handler);
				elementsToRemove.add(element);
			}
		});
		listeners_to_cleanup = listeners_to_cleanup.filter(({ element, listener_type, handler }) => !elementsToRemove.has(element));

		const elementsToRemoveArray = Array.from(elementsToRemove);
		elementsToRemoveArray.forEach(child => {
			if (child.parentNode) {
				child.parentNode.removeChild(child);
			}
			elementsToRemove.delete(child);
		});
	}

	this.displayStateTypes = function(type_list) {
		let panel_class_select = document.getElementById('panel_class_select');

		type_list.sort((el1, el2) => {
			return el1.split(".")[1].localeCompare(el2.split(".")[1]);
		});

		for (let i=0; i<type_list.length; ++i) {
			state_def = WS.Statelib.getFromLib(type_list[i]);

			state_div = document.createElement("div");
			state_div.setAttribute("id", "class_select_" + state_def.getStatePackage() + "_" + state_def.getStateClass());
			state_div.setAttribute("class", "panel_class_select_class");
			state_div.setAttribute("value", type_list[i]);
			state_div.setAttribute("tabindex", "0");
			state_div.innerHTML =
				  '<b>' + state_def.getStateClass() + '</b><br>'
				+ '<i>' + state_def.getShortDesc() + '</i>';

			const clickHandler = function(event) {
				event.preventDefault(); // Prevent default action
				event.stopPropagation(); // Stop the event from propagating to other handlers
				document.getElementById('add_state_class').value = this.getAttribute("value");
				UI.Panels.refocusStart();
			}
			state_div.addEventListener('click', clickHandler);
			listeners_to_cleanup.push({'element': state_div, 'listener_type': 'click', 'handler': clickHandler});

			const enterHandler = function(event) {
				if (event.key === 'Enter' || event.key === ' ') {
					// allow enter or space selection from list equivalent to click
					clickHandler(event);
				}
			}
			state_div.addEventListener('keydown', enterHandler);
			listeners_to_cleanup.push({'element': state_div, 'listener_type': 'keydown', 'handler': enterHandler});

			that.addHoverDetails(state_div, state_def);

			panel_class_select.appendChild(state_div);
		}
	};

	this.show = function() {
		that.clearChildElements();
		panel_class_select.innerHTML = "";
		statelib = WS.Statelib.getTypeList();
		that.displayStateTypes(statelib);
		UI.Panels.setActivePanel(UI.Panels.ADD_STATE_PANEL);
		UI.Settings.createStatePackageSelect(document.getElementById("input_package_filter"), true);
		UI.Panels.updatePanelTabTargets(UI.Panels.ADD_STATE_PANEL);
	}

	this.hide = function() {
		UI.Panels.hidePanelIfActive(UI.Panels.ADD_STATE_PANEL);
		document.getElementById("input_class_filter").value = "";
		document.activeElement.blur();
		that.removeHover();
		that.clearChildElements();
	}

	this.addStateConfirmClicked = function() {
		let state_name = document.getElementById("add_state_name").value;
		let state_type = document.getElementById("add_state_class").value;
		if (state_name == "" || state_type == "") return;
		if (UI.Statemachine.getDisplayedSM().getStateByName(state_name) != undefined) {
			T.logWarn("State name already in use!");
			return;
		}

		let state_def = WS.Statelib.getFromLib(state_type);
		let new_state = new State(state_name, state_def);
		let sm = UI.Statemachine.getDisplayedSM();
		sm.addState(new_state);

		document.getElementById("add_state_name").value = "";
		document.getElementById("add_state_class").value = "";
		document.getElementById("input_class_filter").value = "";
		UI.Panels.AddState.filterChanged();

		UI.Statemachine.refreshView();
		UI.Panels.StateProperties.displayStateProperties(new_state);

		let state_path = new_state.getStatePath();
		let container_path = new_state.getContainer().getStatePath();

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_ADD,
			"Added new state " + state_name,
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
				let redo_state = new State(state_name, WS.Statelib.getFromLib(state_type));
				container.addState(redo_state);
				UI.Statemachine.refreshView();
			}
		);
	}

	this.filterChanged = function() {
		that.filterClassList();
	}

	this.addStateCancelClicked = function() {
		UI.Panels.AddState.hide();
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