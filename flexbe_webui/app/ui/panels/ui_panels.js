UI.Panels = new (function() {
	var that = this;

	var activePanel = this.NO_PANEL;
	var tab_targets = [];

	this.displayAddState = function() {
		let panel = document.getElementById("panel_add_state");
		panel.style.right = "0px";
		panel.style.padding = "5px 5px";
		panel.addEventListener('keydown', that.handleKeyDown); // Add the event listener

	}

	this.hideAddState = function() {
		let panel = document.getElementById("panel_add_state");
		panel.style.right = "-360px";
		panel.style.padding = "5px 0px";
		panel.removeEventListener('keydown', that.handleKeyDown); // Remove the event listener
		tab_targets.length = 0;
	}

	this.displaySelectBehavior = function() {
		let panel = document.getElementById("panel_select_behavior");
		panel.style.right = "0px";
		panel.style.padding = "5px 5px";
		panel.addEventListener('keydown', that.handleKeyDown); // Add the event listener
	}

	this.hideSelectBehavior = function() {
		let panel = document.getElementById("panel_select_behavior");
		panel.style.right = "-360px";
		panel.style.padding = "5px 0px";
		panel.removeEventListener('keydown', that.handleKeyDown); // Remove the event listener
		tab_targets.length = 0;
	}

	this.displayProperties = function(sub_panel) {
		let panel = document.getElementById("panel_properties");
		panel.style.right = "0px";
		panel.style.padding = "5px 5px";
		panel.addEventListener('keydown', that.handleKeyDown); // Add the event listener
	}

	this.hideProperties = function() {
		let panel = document.getElementById("panel_properties");
		panel.style.right = "-360px";
		panel.style.padding = "5px 0px";
		panel.removeEventListener('keydown', that.handleKeyDown); // Remove the event listener
		tab_targets.length = 0;
	}

	this.displayTerminal = function() {
		let panel = document.getElementById("terminal");
		panel.style.height = "calc(30% - 30px)";
		panel.style.padding = "5px";
		panel.style.width = "calc(100% - 10px)";
	}

	this.hideTerminal = function() {
		let panel = document.getElementById("terminal");
		panel.style.height = "0";
		panel.style.padding = "0";
		panel.style.width = "100%";
	}


	this.ADD_STATE_PANEL = "addState";
	this.SELECT_BEHAVIOR_PANEL = "selectBehavior";
	this.STATE_PROPERTIES_PANEL = "stateProperties";
	this.TERMINAL_PANEL = "terminal";
	this.NO_PANEL = "no";

	this.setFocus = function() {
		if (activePanel === this.NO_PANEL) return;
		if (activePanel == that.ADD_STATE_PANEL) document.getElementById("panel_add_state").focus({preventScroll: true});
		else if (activePanel == that.SELECT_BEHAVIOR_PANEL) document.getElementById("panel_select_behavior").focus({preventScroll: true});
		else if (activePanel == that.STATE_PROPERTIES_PANEL) document.getElementById("panel_properties").focus({preventScroll: true});
		console.log(`Set focus to '${activePanel}' active element '${document.activeElement.id}'`);
	}

	this.setActivePanel = function(panel, sub_panel='') {
		if (panel == activePanel) return;

		that.hidePanelIfActive(activePanel);

		console.log(`setActivePanel '${panel}' - '${sub_panel}' ...`);
		if (panel == that.ADD_STATE_PANEL) that.displayAddState();
		else if (panel == that.SELECT_BEHAVIOR_PANEL) that.displaySelectBehavior();
		else if (panel == that.STATE_PROPERTIES_PANEL) that.displayProperties(sub_panel);
		else if (panel == that.TERMINAL_PANEL) that.displayTerminal();

		activePanel = panel;

		if (panel !== this.NO_PANEL) that.setupTabHandling(panel, sub_panel);
	}

	this.isActivePanel = function(panel) {
		return panel == activePanel;
	}

	this.hideAllPanels = function() {
		if (activePanel != that.NO_PANEL) {
			console.log(`Hiding the active '${activePanel}' panel`);
			that.hidePanelIfActive(activePanel);
		}
	}

	this.hidePanelIfActive = function(panel) {
		if (panel != activePanel) return;

		if (activePanel == that.ADD_STATE_PANEL) that.hideAddState();
		else if (activePanel == that.SELECT_BEHAVIOR_PANEL) that.hideSelectBehavior();
		else if (activePanel == that.STATE_PROPERTIES_PANEL) that.hideProperties();
		else if (activePanel == that.TERMINAL_PANEL) that.hideTerminal();

		activePanel = that.NO_PANEL;
	}

	this.setupTabHandling = function(panel, sub_panel='') {
		// console.log(`\x1b[95m  Set up tab handling for '${panel}' '${sub_panel}' ...\x1b[0m`);
		if (document.activeElement) {
			document.activeElement.blur();
		}
		that.updatePanelTabTargets(panel, sub_panel);

		if (tab_targets.length > 0) {
			// console.log(`\x1b[95m  Found ${tab_targets.length} TABS found for '${panel}'\x1b[0m`);
			// Hold focus for state to allow multiclick
			if (sub_panel === '') tab_targets[0].focus({ preventScroll: true });
		//} else {
		//	console.log(`\x1b[95m  No TABS found for '${panel}' ...\x1b[0m`);
		}
	}

	this.updatePanelTabTargets = function(panel, sub_panel='') {
		if (panel == that.TERMINAL_PANEL)  return;

		if (panel == that.ADD_STATE_PANEL) that.updateTabTargets(document.getElementById("panel_add_state"),
																".panel_class_select_class, .tag");
		else if (panel == that.SELECT_BEHAVIOR_PANEL) that.updateTabTargets(document.getElementById("panel_select_behavior"),
																			".panel_select_behavior_selection_behavior, .tag");
		else if (panel == that.STATE_PROPERTIES_PANEL) {
			let additional_tab_classes = "";
			if (sub_panel == 'statemachine') {
				additional_tab_classes = ".panel_prop_sm_outcomes_content"
										+", .panel_prop_sm_input_keys_content"
										+", .panel_prop_sm_output_keys_content"
										+", .img_button";
			} else if (sub_panel == 'behavior') {
				additional_tab_classes = ".panel_prop_be_parameters_content"
										+", .panel_prop_be_autonomy_content"
										+", .panel_prop_be_input_keys_content"
										+", .panel_prop_be_output_keys_content";
			} else {
				additional_tab_classes = ".panel_prop_parameters_content"
										+", .panel_prop_autonomy_content"
										+", .panel_prop_input_keys_content"
										+", .panel_prop_output_keys_content";
			}
			that.updateTabTargets(document.getElementById("panel_properties_" + sub_panel), additional_tab_classes);
		}
	}

	this.updateTabTargets = function(panel, additional_select_tags='') {
		if (additional_select_tags != '') {
			additional_select_tags = ', ' + additional_select_tags;
		}
		tab_targets = Array.from(panel.querySelectorAll("input, textarea, select, button"
															+ additional_select_tags)); // Add more selectors if needed
		tab_targets = tab_targets.filter(function(el) {
			if (el.tabIndex === -1) return false;
			if (el.id == '') {
				return false;
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
		tab_targets.sort(function(a, b) {
			if (a.tabIndex === b.tabIndex) {
				// if tabIndex not set, then use DOCUMENT_POSITION_PRECEDING flag test (b proceeds a)
				return a.compareDocumentPosition(b) & 2 ? 1 : -1;
			}
			return a.tabIndex - b.tabIndex;
		});
	}

	// Define the event listener function
	this.handleKeyDown = function(event) {
		if (event.key === "Tab") {
			// Panel is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			if (activePanel === that.NO_PANEL) {
				return;
			}
			if (tab_targets.length == 0) {
				return;
			}
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
					//console.log(`  try TAB event matched panel '${activePanel}' from '${event.target.id}' -${new_match_ndx} '${new_match.id}' `);
				}
				//console.log(`Panel keydown handler for '${activePanel}' from '${event.target.id}' key='${event.key}' - moved to  '${document.activeElement.id}'!`);
			} else {
				tab_targets[0].focus({ preventScroll: true }); // Move focus to the first input
			}
		} else if (event.key === 'Escape') {
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			that.hideAllPanels();
		}
	}

}) ();