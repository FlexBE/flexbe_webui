// Add Event Listeners
document.addEventListener('DOMContentLoaded', function() {
	var onEnterButton = function(cb) { return function(event) {
			// Allow button selection based on Enter or space bar if highlighted
			if(event.key === 'Enter' || event.key === ' ') {
				event.preventDefault(); // Prevent default action for Enter key
				event.stopPropagation(); // Stop the event from propagating to other handlers

				// Suppress the default click event that follows
				var suppressClick = function(clickEvent) {
					clickEvent.stopImmediatePropagation();
					clickEvent.preventDefault();
					console.log(`\x1b[36mClick event suppressed from '${event.target.id}'\x1b[0m`);
				};

				// Add temporary click event listener to suppress click (automatically removed after used once)
				event.target.addEventListener('click', suppressClick, { capture: true, once: true });

				cb(event);

			}
		}
	};

	var onEnterInput = function(cb) { return function(event) {
			// Allow input selection based on Enter (only) if highlighted
			if(event.key === 'Enter') {
				event.preventDefault(); // Prevent default action for Enter key
				event.stopPropagation(); // Stop the event from propagating to other handlers

				// Suppress the default click event that follows
				var suppressClick = function(clickEvent) {
					clickEvent.stopImmediatePropagation();
					clickEvent.preventDefault();
				};

				// Add temporary click event listener to suppress click (automatically removed after used once)
				event.target.addEventListener('click', suppressClick, { capture: true, once: true });

				cb(event);

			}
		}
	};


	var onEnterFocusChange = function (cb, id) { return onEnterInput(function(event) {
			cb(event);
			document.getElementById(id).focus({ preventScroll: true });
		});
	};

	function onCheckboxChange(event) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault(); // Prevent default action (scrolling for Space)
			event.stopPropagation(); // Stop the event from propagating to other handlers
			event.target.checked = !event.target.checked; // Toggle checkbox state
			event.target.dispatchEvent(new Event('change')); // Trigger change event
		}
	}


// General

	// These are last chance listeners - we want that any keys are handled by their respective panes first!
	document.addEventListener('keydown', UI.Tools.handleTopLevelKeyDown);
	document.addEventListener('keyup',   UI.Tools.handleTopLevelKeyUp);

	document.getElementById('top-level-toolbar').addEventListener('keydown', UI.Menu.handleKeyDown);
	document.getElementById('top-level-toolbar').addEventListener('keyup', UI.Menu.handleKeyUp);
	document.getElementById('top-level-toolbar').addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		if (event.target.id  == '' || event.target.id == 'top-level-toolbar') {
			UI.Menu.setupTabHandling();
		}
	});

	document.getElementById('flexbe_about').addEventListener('click', UI.Feed.showAbout);

	document.getElementById('button_to_db').addEventListener('click', UI.Menu.toDashboardClicked);
	document.getElementById('button_to_sm').addEventListener('click', UI.Menu.toStatemachineClicked);
	document.getElementById('button_to_rc').addEventListener('click', UI.Menu.toControlClicked);
	document.getElementById('button_to_se').addEventListener('click', UI.Menu.toSettingsClicked);
	document.getElementById('button_to_db').addEventListener('keydown', onEnterButton(UI.Menu.toDashboardClicked));
	document.getElementById('button_to_sm').addEventListener('keydown', onEnterButton(UI.Menu.toStatemachineClicked));
	document.getElementById('button_to_rc').addEventListener('keydown', onEnterButton(UI.Menu.toControlClicked));
	document.getElementById('button_to_se').addEventListener('keydown', onEnterButton(UI.Menu.toSettingsClicked));

	document.getElementById('terminal').addEventListener('click', UI.Panels.Terminal.hide);

	document.getElementById('tool_overlay_undo').addEventListener('click', UI.Tools.undoClicked);
	document.getElementById('tool_overlay_redo').addEventListener('click', UI.Tools.redoClicked);
	document.getElementById('tool_overlay_copy').addEventListener('click', UI.Tools.copyClicked);
	document.getElementById('tool_overlay_paste').addEventListener('click', UI.Tools.pasteClicked);
	document.getElementById('tool_overlay_cut').addEventListener('click', UI.Tools.cutClicked);
	document.getElementById('tool_overlay_dfg').addEventListener('click', UI.Tools.dfgClicked);
	document.getElementById('tool_overlay_terminal').addEventListener('click', UI.Tools.terminalClicked);
	document.getElementById('tool_overlay_save').addEventListener('click', UI.Tools.saveClicked);

// Behavior Dashboard
	document.getElementById("dashboard").addEventListener('keydown', UI.Dashboard.handleKeyDown);
	document.getElementById("dashboard").addEventListener('keyup', UI.Dashboard.handleKeyUp);
	document.getElementById("dashboard").addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		 if (event.target.id  == '' || event.target.id == 'dashboard') {
			UI.Dashboard.setupTabHandling();
		}
	 });

	document.getElementById('select_behavior_package').addEventListener('change', UI.Dashboard.behaviorPackageChanged);
	document.getElementById('input_behavior_name').addEventListener('blur', UI.Dashboard.behaviorNameChanged);
	document.getElementById('input_behavior_description').addEventListener('blur', UI.Dashboard.behaviorDescriptionChanged);
	document.getElementById('input_behavior_tags').addEventListener('blur', UI.Dashboard.behaviorTagsChanged);
	document.getElementById('input_behavior_author').addEventListener('blur', UI.Dashboard.behaviorAuthorChanged);
	document.getElementById('input_behavior_date').addEventListener('blur', UI.Dashboard.behaviorDateChanged);

	document.getElementById('button_db_variable_add').addEventListener('click', UI.Dashboard.addPrivateVariableClicked);
	document.getElementById('button_db_variable_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addPrivateVariableClicked));
	document.getElementById('input_db_variable_key_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addPrivateVariableClicked));
	document.getElementById('input_db_variable_value_add').addEventListener('keydown', onEnterFocusChange(UI.Dashboard.addPrivateVariableClicked, 'input_db_variable_key_add'));

	document.getElementById('button_db_userdata_add').addEventListener('click', UI.Dashboard.addDefaultUserdataClicked);
	document.getElementById('button_db_userdata_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addDefaultUserdataClicked));
	document.getElementById('input_db_userdata_key_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addDefaultUserdataClicked));
	document.getElementById('input_db_userdata_value_add').addEventListener('keydown', onEnterFocusChange(UI.Dashboard.addDefaultUserdataClicked, 'input_db_userdata_key_add'));

	document.getElementById('button_db_parameter_add').addEventListener('click', UI.Dashboard.addParameterClicked);
	document.getElementById('button_db_parameter_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addParameterClicked));
	document.getElementById('input_db_parameter_name_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addParameterClicked));
	//document.getElementById('db_parameter_edit_table_turn_button').addEventListener('click', UI.Dashboard.turnParameterClicked);
	//document.getElementById('db_parameter_edit_table_turn_button').addEventListener('keydown', onEnterInput(UI.Dashboard.turnParameterClicked));

	document.getElementById('button_db_outcome_add').addEventListener('click', UI.Dashboard.addBehaviorOutcomeClicked);
	document.getElementById('button_db_outcome_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addBehaviorOutcomeClicked));
	document.getElementById('button_db_input_key_add').addEventListener('click', UI.Dashboard.addBehaviorInputKeyClicked);
	document.getElementById('button_db_input_key_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addBehaviorInputKeyClicked));
	document.getElementById('input_db_outcome_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addBehaviorOutcomeClicked));
	document.getElementById('input_db_input_key_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addBehaviorInputKeyClicked));
	document.getElementById('button_db_output_key_add').addEventListener('click', UI.Dashboard.addBehaviorOutputKeyClicked);
	document.getElementById('button_db_output_key_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addBehaviorOutputKeyClicked));
	document.getElementById('input_db_output_key_add').addEventListener('keydown', onEnterInput(UI.Dashboard.addBehaviorOutputKeyClicked));

	document.getElementById('button_db_manual_import_add').addEventListener('click', UI.Dashboard.addManualImportClicked);
	document.getElementById('button_db_manual_import_add').addEventListener('keydown', onEnterButton(UI.Dashboard.addManualImportClicked));
	document.getElementById('input_db_manual_import_value_add').addEventListener('keydown', onEnterFocusChange(UI.Dashboard.addManualImportClicked, 'input_db_manual_import_value_add'));

	document.getElementById("db_function_box").addEventListener("click", UI.Dashboard.editPrivateFunctionClicked);
	document.getElementById("db_manual_init_box").addEventListener("click", UI.Dashboard.editManualInitClicked);
	document.getElementById("db_manual_create_box").addEventListener("click", UI.Dashboard.editManualCreateClicked);
	document.getElementById("db_function_box").addEventListener("keydown", onEnterButton(UI.Dashboard.editPrivateFunctionClicked));
	document.getElementById("db_manual_init_box").addEventListener("keydown", onEnterButton(UI.Dashboard.editManualInitClicked));
	document.getElementById("db_manual_create_box").addEventListener("keydown", onEnterButton(UI.Dashboard.editManualCreateClicked));

// State Machine Editor
	document.getElementById("statemachine").addEventListener('keydown', UI.Statemachine.handleKeyDown);
	document.getElementById("statemachine").addEventListener('keyup', UI.Statemachine.handleKeyUp);
	document.getElementById('statemachine').addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		if (event.target.id  == '' || event.target.id == 'statemachine') {
			document.getElementById("statemachine").focus({preventScroll: true});
		}
	});
	document.getElementById('panel_properties').addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		if (event.target.id  == '' || event.target.id == 'panel_properties') {
			UI.Panels.setFocus();
		}
	});

	document.getElementById('add_state_name').addEventListener('keydown', onEnterInput(UI.Panels.AddState.addStateConfirmClicked));
	document.getElementById('button_add_state_confirm').addEventListener('click', UI.Panels.AddState.addStateConfirmClicked);
	document.getElementById('button_add_state_confirm').addEventListener('keydown', onEnterButton(UI.Panels.AddState.addStateConfirmClicked));
	document.getElementById('button_add_state_cancel').addEventListener('click', UI.Panels.AddState.addStateCancelClicked);
	document.getElementById('button_add_state_cancel').addEventListener('keydown', onEnterButton(UI.Panels.AddState.addStateCancelClicked));

	document.getElementById('button_select_behavior_cancel').addEventListener('click', UI.Panels.SelectBehavior.behaviorSelectCancelClicked);
	document.getElementById('button_select_behavior_cancel').addEventListener('keydown', onEnterButton(UI.Panels.SelectBehavior.behaviorSelectCancelClicked));

	document.getElementById('button_apply_properties').addEventListener('click', UI.Panels.StateProperties.applyPropertiesClicked);
	document.getElementById('button_apply_properties').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.applyPropertiesClicked));
	document.getElementById('button_close_properties').addEventListener('click', UI.Panels.StateProperties.closePropertiesClicked);
	document.getElementById('button_close_properties').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.closePropertiesClicked));
	document.getElementById('button_delete_state').addEventListener('click', UI.Panels.StateProperties.deleteStateClicked);
	document.getElementById('button_delete_state').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.deleteStateClicked));

	document.getElementById('select_container_type').addEventListener('change', UI.Panels.StateProperties.containerTypeChanged);

	document.getElementById('cb_display_synthesis').addEventListener('change', UI.Panels.StateProperties.displaySynthesisClicked);
	document.getElementById('cb_display_synthesis').addEventListener('keydown', onCheckboxChange);
	document.getElementById('button_prop_synthesize').addEventListener('click', UI.Panels.StateProperties.synthesizeClicked);
	document.getElementById('button_prop_synthesize').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.synthesizeClicked));

	document.getElementById('button_view_state').addEventListener('click', UI.Panels.StateProperties.viewStateSourceCode);
	document.getElementById('button_view_behavior').addEventListener('click', UI.Panels.StateProperties.openBehavior);
	document.getElementById('button_view_behavior_code').addEventListener('click', UI.Panels.StateProperties.viewBehaviorSourceCode);
	document.getElementById('button_view_statemachine').addEventListener('click', UI.Panels.StateProperties.openStatemachine);
	document.getElementById('button_view_state').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.viewStateSourceCode));
	document.getElementById('button_view_behavior').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.openBehavior));
	document.getElementById('button_view_behavior_code').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.viewBehaviorSourceCode));
	document.getElementById('button_view_statemachine').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.openStatemachine));

	document.getElementById('button_prop_outcome_add').addEventListener('click', UI.Panels.StateProperties.addSMOutcome);
	document.getElementById('button_prop_input_key_add').addEventListener('click', UI.Panels.StateProperties.addSMInputKey);
	document.getElementById('button_prop_output_key_add').addEventListener('click', UI.Panels.StateProperties.addSMOutputKey);
	document.getElementById('button_prop_outcome_add').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.addSMOutcome));
	document.getElementById('button_prop_input_key_add').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.addSMInputKey));
	document.getElementById('button_prop_output_key_add').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.addSMOutputKey));

	document.getElementById('input_prop_outcome_add').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.addSMOutcome));
	document.getElementById('input_prop_input_key_add').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.addSMInputKey));
	document.getElementById('input_prop_output_key_add').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.addSMOutputKey));

	document.getElementById('button_close_be_properties').addEventListener('click', UI.Panels.StateProperties.closePropertiesClicked);
	document.getElementById('button_close_be_properties').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.closePropertiesClicked));
	document.getElementById('button_delete_be').addEventListener('click', UI.Panels.StateProperties.deleteStateClicked);
	document.getElementById('button_delete_be').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.deleteStateClicked));

	document.getElementById('button_close_sm_properties').addEventListener('click', UI.Panels.StateProperties.closePropertiesClicked);
	document.getElementById('button_close_sm_properties').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.closePropertiesClicked));
	document.getElementById('button_delete_sm').addEventListener('click', UI.Panels.StateProperties.deleteStateClicked);
	document.getElementById('button_delete_sm').addEventListener('keydown', onEnterButton(UI.Panels.StateProperties.deleteStateClicked));

	document.getElementById('input_prop_state_name').addEventListener('blur', UI.Panels.StateProperties.statePropNameChanged);
	document.getElementById('input_prop_be_name').addEventListener('blur', UI.Panels.StateProperties.statePropNameChanged);
	document.getElementById('input_prop_sm_name').addEventListener('blur', UI.Panels.StateProperties.statePropNameChanged);

	document.getElementById('input_prop_state_name').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.statePropNameChanged));
	document.getElementById('input_prop_be_name').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.statePropNameChanged));
	document.getElementById('input_prop_sm_name').addEventListener('keydown', onEnterInput(UI.Panels.StateProperties.statePropNameChanged));

	document.getElementById('input_class_filter').addEventListener('keydown', UI.Panels.AddState.filterChanged);
	document.getElementById('input_package_filter').addEventListener('change', UI.Panels.AddState.filterChanged);

	document.getElementById('input_behavior_filter').addEventListener('keydown', UI.Panels.SelectBehavior.behaviorFilterChanged);
	document.getElementById('input_behavior_package_filter').addEventListener('change', UI.Panels.SelectBehavior.behaviorFilterChanged);

// Runtime Control
	document.getElementById("runtimecontrol").addEventListener('keydown', UI.RuntimeControl.handleKeyDown);
	document.getElementById("runtimecontrol").addEventListener('keyup', UI.RuntimeControl.handleKeyUp);
	document.getElementById('runtimecontrol').addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		if (event.target.id  == '' || event.target.id == 'runtimecontrol') {
			UI.RuntimeControl.setupTabHandling();
		}
	});

	document.getElementById('button_rc_connect').addEventListener('click', UI.RuntimeControl.connectClicked);
	document.getElementById('button_rc_save').addEventListener('click', UI.Menu.saveBehaviorClicked);
	document.getElementById('button_rc_load').addEventListener('click', UI.Menu.loadBehaviorClicked);
	document.getElementById('button_rc_connect').addEventListener('keydown', onEnterButton(UI.RuntimeControl.connectClicked));
	document.getElementById('button_rc_save').addEventListener('keydown', onEnterButton(UI.Menu.saveBehaviorClicked));
	document.getElementById('button_rc_load').addEventListener('keydown', onEnterButton(UI.Menu.loadBehaviorClicked));

	document.getElementById('button_behavior_start').addEventListener('click', UI.RuntimeControl.startBehaviorClicked);
	document.getElementById('button_behavior_params_reset').addEventListener('click', UI.RuntimeControl.resetParameterTableClicked);
	document.getElementById('button_behavior_attach_external').addEventListener('click', UI.RuntimeControl.attachExternalClicked);
	document.getElementById('button_behavior_start').addEventListener('keydown', onEnterButton(UI.RuntimeControl.startBehaviorClicked));
	document.getElementById('button_behavior_params_reset').addEventListener('keydown', onEnterButton(UI.RuntimeControl.resetParameterTableClicked));
	document.getElementById('button_behavior_attach_external').addEventListener('keydown', onEnterButton(UI.RuntimeControl.attachExternalClicked));

	document.getElementById('sync_bar').addEventListener('click', UI.RuntimeControl.toggleSyncExtension);
	document.getElementById('button_behavior_lock').addEventListener('click', UI.RuntimeControl.behaviorLockClicked);
	document.getElementById('selection_rc_autonomy').addEventListener('change', UI.RuntimeControl.autonomySelectionChanged);
	document.getElementById('button_behavior_repeat').addEventListener('click', UI.RuntimeControl.repeatBehaviorClicked);
	document.getElementById('button_behavior_pause').addEventListener('click', UI.RuntimeControl.pauseBehaviorClicked);
	document.getElementById('button_behavior_preempt').addEventListener('click', UI.RuntimeControl.preemptBehaviorClicked);
	document.getElementById('cb_allow_preempt').addEventListener('change', UI.RuntimeControl.allowPreemptClicked);
	document.getElementById('button_behavior_sync').addEventListener('click', UI.RuntimeControl.syncMirrorClicked);
	// For above buttons, require targeted click and not Enter with behavior running

// Settings
	document.getElementById("settings").addEventListener('keydown', UI.Settings.handleKeyDown);
	document.getElementById("settings").addEventListener('keyup', UI.Settings.handleKeyUp);
	document.getElementById('settings').addEventListener('click', function(event) {
		// Add click event listener to the pane to ensure it gains focus for key events (e.g. tabs)
		if (event.target.id  == '' || event.target.id == 'settings') {
			UI.Settings.setupTabHandling();
		}
	});

	document.getElementById('select_code_indentation').addEventListener('change', UI.Settings.codeIndentationChanged);
	document.getElementById('cb_collapse_hint').addEventListener('change', UI.Settings.collapseHintClicked);
	document.getElementById('cb_collapse_info').addEventListener('change', UI.Settings.collapseInfoClicked);
	document.getElementById('cb_collapse_warn').addEventListener('change', UI.Settings.collapseWarnClicked);
	document.getElementById('cb_collapse_error').addEventListener('change', UI.Settings.collapseErrorClicked);

	document.getElementById('cb_collapse_hint').addEventListener('keydown', onCheckboxChange);
	document.getElementById('cb_collapse_info').addEventListener('keydown', onCheckboxChange);
	document.getElementById('cb_collapse_warn').addEventListener('keydown', onCheckboxChange);
	document.getElementById('cb_collapse_error').addEventListener('keydown', onCheckboxChange);

	document.getElementById('cb_commands_enabled').addEventListener('change', UI.Settings.commandsEnabledClicked);
	document.getElementById('cb_commands_enabled').addEventListener('keydown', onCheckboxChange);
	document.getElementById('input_commands_key').addEventListener('change', UI.Settings.commandsKeyChanged);
	document.getElementById('input_commands_form').addEventListener('submit', function(event) {
		event.preventDefault();
	});

	document.getElementById('select_default_package').addEventListener('change', UI.Settings.defaultPackageChanged);
	document.getElementById('input_editor_command').addEventListener('change', UI.Settings.editorCommandChanged);
	document.getElementById('cb_explicit_states').addEventListener('change', UI.Settings.explicitStatesClicked);
	document.getElementById('cb_explicit_states').addEventListener('keydown', onCheckboxChange);

	document.getElementById('input_gridsize').addEventListener('change', UI.Settings.gridsizeChanged);

	document.getElementById('cb_pkg_cache_enabled').addEventListener('change', UI.Settings.pkgCacheEnabledClicked);
	document.getElementById('cb_pkg_cache_enabled').addEventListener('keydown', onCheckboxChange);

	document.getElementById('input_runtime_timeout').addEventListener('blur', UI.Settings.runtimeTimeoutChanged);

	document.getElementById('cb_save_in_source').addEventListener('change', UI.Settings.saveInSourceClicked);
	document.getElementById('cb_save_in_source').addEventListener('keydown', onCheckboxChange);
	document.getElementById('input_source_code_root').addEventListener('change', UI.Settings.sourceCodeRootChanged);

	document.getElementById('cb_stop_behaviors').addEventListener('change', UI.Settings.stopBehaviorsClicked);
	document.getElementById('cb_stop_behaviors').addEventListener('keydown', onCheckboxChange);

	document.getElementById('cb_synthesis_enabled').addEventListener('change', UI.Settings.synthesisEnabledClicked);
	document.getElementById('cb_synthesis_enabled').addEventListener('keydown', onCheckboxChange);
	document.getElementById('input_synthesis_topic').addEventListener('change', UI.Settings.synthesisTopicChanged);
	document.getElementById('input_synthesis_type').addEventListener('change', UI.Settings.synthesisTypeChanged);
	document.getElementById('input_synthesis_system').addEventListener('change', UI.Settings.synthesisSystemChanged);

	document.getElementById('select_transition_mode').addEventListener('change', UI.Settings.transitionEndpointsChanged);

	// Misc commands
	document.getElementById('button_force_discover').addEventListener('click', UI.Settings.forceDiscoverClicked);
	document.getElementById('button_ros_connect').addEventListener('click', UI.Settings.rosConnectClicked);
	document.getElementById('button_force_discover').addEventListener('keydown', onEnterButton(UI.Settings.forceDiscoverClicked));
	document.getElementById('button_ros_connect').addEventListener('keydown', onEnterButton(UI.Settings.rosConnectClicked));

////////////////////////////////////////////////////////////////////////////////////////////////

	// Key Bindings
	Mousetrap.bind("ctrl+z", ActivityTracer.undo);
	Mousetrap.bind("ctrl+y", ActivityTracer.redo);

	Mousetrap.bind("ctrl+c", Tools.copy);
	Mousetrap.bind("ctrl+x", Tools.cut);
	Mousetrap.bind("ctrl+v", Tools.paste);

	Mousetrap.bind("f1", UI.Menu.toDashboardClicked );
	Mousetrap.bind("f2", UI.Menu.toStatemachineClicked );
	Mousetrap.bind("f3", UI.Menu.toControlClicked );
	Mousetrap.bind("f4", UI.Menu.toSettingsClicked );

	Mousetrap.bind("ctrl+t", UI.Panels.Terminal.toggle );

	Mousetrap.bind("esc", function() {
		UI.Statemachine.abortTransition();
		UI.Statemachine.removeSelection();
	});
	Mousetrap.bind("del", UI.Statemachine.removeTransition );

	UI.Menu.configureKeybindings();

	Mousetrap(document.getElementById("input_note_editor_text")).bind("shift+enter", function() {
		var evt = new CustomEvent("click", { "detail": "shift+enter" });
		document.getElementById("button_note_editor_save").dispatchEvent(evt);
	});

	window.addEventListener('resize', function() {
		console.log(`\x1b[93m Resize drawing areas\x1b[0m`);
		UI.Statemachine.recreateDrawingArea();
		UI.RuntimeControl.recreateDrawingArea();
	});

});


