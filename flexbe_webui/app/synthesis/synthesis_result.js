Synthesis = (typeof Synthesis == 'undefined') ? {} : Synthesis;

Synthesis.Result = new (function() {
	var rootInfo = function(root) {
		var root_split = root.split("/");
		var root_name = root_split[root_split.length - 1];
		return {
			name: root_name,
			container_path: root.replace("/" + root_name, "")
		};
	}

	var updateSynthesizedTransitionGeometry = function(state_machine) {
		if (UI.Statemachine.updateTransitionGeometry == undefined) {
			return false;
		}
		return UI.Statemachine.updateTransitionGeometry(state_machine);
	}

	this.handle = function(result, root, result_cb) {
		console.log(`\x1b[92mSynthesis.Result: handle synthesis action result ...\x1b[0m`);
		UI.Tools.closeSynthesisProgress();
		if (result == undefined) {
			T.logError("Synthesis cancelled.");
			return;
		}
		if (result.error_code == undefined) {
			T.logError("Synthesis result missing error_code field.");
			return;
		}
		if (result.error_code.value != 1) {
			var err_msgs = (result.messages && result.messages.length > 0) ? result.messages : [];
			T.logError("Synthesis failed: " + result.error_code.value);
			UI.Tools.customSynthesisResult("Synthesis Failed (code " + result.error_code.value + ")", err_msgs, true);
			return;
		}
		if (root == undefined || root == null) {
			T.logError("Synthesis result missing root path.");
			return;
		}

		var root_info = rootInfo(root);
		var root_container = (root_info.container_path == "")? Behavior.getStatemachine() :
								Behavior.getStatemachine().getStateByPath(root_info.container_path);
		if (root_container == undefined) {
			T.logError(`Synthesis result has unknown root container path '${root_info.container_path}'`);
			return;
		}
		var root_varname = "";
		var defs = IO.ModelGenerator.parseInstantiationMsg(result.states);
		if (defs == undefined) {
			T.logError('Aborted synthesis because of previous errors.');
			return;
		}

		var state_machine = IO.ModelGenerator.buildStateMachine(root_info.name, root_varname, defs.sm_defs, defs.sm_states, true);
		console.log(`        built state machine name = '${state_machine.getStateName()}' ...`);

		var sm_instance = root_container.getStateByName(state_machine.getStateName());
		state_machine.setContainer(root_container);
		if (sm_instance != undefined) {
			console.log(`        add state machine instance inside existing container ...`);

			var transitions = root_container.getTransitions().filter(function(t) {
				return t.getFrom().getStateName() == sm_instance.getStateName() && state_machine.getOutcomes().contains(t.getOutcome())
					|| t.getTo() != undefined && t.getTo().getStateName() == sm_instance.getStateName();
			});

			var o_keys = sm_instance.getOutputKeys();
			var i_keys = sm_instance.getInputKeys();
			var o_maps = sm_instance.getOutputMapping();
			var i_maps = sm_instance.getInputMapping();
			var is_initial = root_container.getInitialState() != undefined && sm_instance.getStateName() == root_container.getInitialState().getStateName();

			root_container.removeState(sm_instance);
			root_container.addState(state_machine);
			if (is_initial) root_container.setInitialState(state_machine);
			transitions.forEach(function (t) {
				if (t.getTo() != undefined && t.getTo().getStateName() == state_machine.getStateName()) t.setTo(state_machine);
				if (t.getFrom().getStateName() == state_machine.getStateName()) t.setFrom(state_machine);
			});

			state_machine.setInputKeys(i_keys);
			state_machine.setOutputKeys(o_keys);
			state_machine.setInputMapping(i_maps);
			state_machine.setOutputMapping(o_maps);

			transitions.forEach(root_container.addTransition);
			console.log(`\x1b[92mSynthesis.Result: finished updating container with synthesized state machine!\x1b[0m`);
		} else {
			console.log(`\x1b[92mSynthesis.Result: adding synthesized SM directly to root container ...\x1b[0m`);
			root_container.addState(state_machine);
		}

		var updated_transition_geometry = updateSynthesizedTransitionGeometry(state_machine);
		if(!updated_transition_geometry && UI.Menu.isPageStatemachine()) UI.Statemachine.refreshView();
		UI.Panels.StateProperties.displayStateProperties(state_machine);

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_ADD,
			"Added synthesized statemachine " + root_info.name,
			function() {
				state_machine.getContainer().removeState(state_machine);
				if (UI.Panels.StateProperties.isCurrentState(state_machine)) {
					UI.Panels.StateProperties.hide();
				}
				UI.Statemachine.refreshView();
			},
			function() {
				var container = (root_info.container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(root_info.container_path);
				if (container == undefined) {
					T.logError(`Redo: unknown container path '${root_info.container_path}'`);
					return;
				}
				container.addState(state_machine);
				if (!updateSynthesizedTransitionGeometry(state_machine)) {
					UI.Statemachine.refreshView();
				}
			}
		);

		var warn_msgs = (result.messages && result.messages.length > 0) ? result.messages : [];
		var state_count = state_machine.getStates().length;
		var title = "Synthesis succeeded with " + state_count + " state" + (state_count != 1 ? "s" : "");
		UI.Tools.customSynthesisResult(title, warn_msgs, false);

		if(result_cb != undefined) result_cb(result);
	}

}) ();
