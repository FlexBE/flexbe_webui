Tools = new (function() {
	var that = this;

	var clipboard = undefined;

	var pasteStateInto = function(s, sm, no_add) {
		let new_state = undefined;
		if (s instanceof Statemachine) {
			const state_def = new WS.StateMachineDefinition(s.getOutcomes(), s.getInputKeys(), s.getOutputKeys());
			new_state = new Statemachine(s.getStateName(), state_def);
			new_state.setPriority(s.isPriority());
			new_state.setConcurrent(s.isConcurrent());
			s.getStates().forEach(function (element) {
				pasteStateInto(element, new_state);
			});
			s.getTransitions().forEach(function (element) {
				if (element.getOutcome() == "" && element.getFrom().getStateName() == "INIT") return;
				var new_from = new_state.getStateByName(element.getFrom().getStateName());
				var new_to = new_state.getStateByName(element.getTo().getStateName());
				var is_outcome = new_to == undefined;
				if (is_outcome) {
					new_to = new_state.getSMOutcomeByName(element.getTo().getStateName());
				}
				new_state.addTransition(new Transition(new_from, new_to, element.getOutcome(), element.getAutonomy()));
				if (new_state.isConcurrent() && is_outcome) {
					new_state.tryDuplicateOutcome(element.getTo().getStateName().split('#')[0]);
				}
			});
			if (s.getInitialState() != undefined) {
				new_state.setInitialState(new_state.getStateByName(s.getInitialState().getStateName()));
			}
		} else if (s instanceof BehaviorState) {
			new_state = new BehaviorState(s.getBehaviorName(), WS.Behaviorlib.getByName(s.getBehaviorName()));
			new_state.setStateName(s.getStateName());
		} else if (s instanceof State) {
			state_def = WS.Statelib.getFromLib(s.getStateType());
			new_state = new State(s.getStateName(), state_def);
		}

		new_state.setStateName(that.getUniqueName(sm, s.getStateName()));
		new_state.setParameterValues(s.getParameterValues().clone());
		new_state.setAutonomy(s.getAutonomy().clone());
		new_state.setInputMapping(s.getInputMapping().clone());
		new_state.setOutputMapping(s.getOutputMapping().clone());
		new_state.setPosition({x: s.getPosition().x, y: s.getPosition().y});
		if (!no_add) sm.addState(new_state);
		return new_state;
	}

	var deleteAll = function(elements) {
		elements.filter(function(s) {
			return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
		}).forEach(function(s) {
			if (UI.Panels.StateProperties.isCurrentState(s))
				UI.Panels.StateProperties.hide();
			s.getContainer().removeState(s);
		});
		UI.Statemachine.refreshView();
	}

	var pasteAll = function(elements, container) {
		var state_list = elements.filter(function(s) {
			return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
		});
		var transition_list = elements.filter(function(t) {
			return t instanceof Transition;
		});


		var new_states = [];
		var renaming = [];
		for (var i = 0; i < state_list.length; i++) {
			var new_state = pasteStateInto(state_list[i], container, true);
			new_states.push(new_state);
			renaming[state_list[i].getStateName()] = new_state.getStateName();
		}

		new_states.forEach(container.addState);

		var new_transitions = [];
		transition_list.forEach(function (transition) {
			var from_state = new_states.findElement(function(s) { return s.getStateName() == renaming[transition.getFrom().getStateName()]; });
			var to_state = new_states.findElement(function(s) { return s.getStateName() == renaming[transition.getTo().getStateName()]; });
			var new_transition = new Transition(from_state, to_state, transition.getOutcome(), transition.getAutonomy());
			new_state.getContainer().addTransition(new_transition);
			new_transitions.push(new_transition);
		});

		UI.Statemachine.refreshView();

		return new_states.concat(new_transitions);
	}


	this.copy = function() {
		clipboard = UI.Statemachine.getSelectedStatesAndTransitions();
		UI.Statemachine.removeSelection();
	}

	this.cut = function() {
		that.copy();

		if(RC.Controller.isRunning()) {
			var locked_state = clipboard.findElement(function(el) {
				return ((el instanceof State) || (el instanceof Statemachine) || (el instanceof BehaviorState))
					&& RC.Controller.isOnLockedPath(el.getStatePath());
			});
			if (locked_state != undefined) {
				clipboard.remove(locked_state);
				clipboard.filter(function(el) {
					return (el instanceof Transition)
						&& (el.getFrom().getStateName() == locked_state.getStateName()
							|| el.getTo().getStateName() == locked_state.getStateName());
				}).forEach(function(t) { clipboard.remove(t); });
			}
		}

		var container = UI.Statemachine.getDisplayedSM();
		var container_path = container.getStatePath();

		var paste_clipboard = clipboard.clone();
		var history_clipboard = paste_clipboard.map(function (element) {
			return (element instanceof Transition)? element : element.getStatePath();
		});

		var state_list = paste_clipboard.filter(function(s) {
			return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
		});
		var transition_list = paste_clipboard.filter(function(t) {
			return t instanceof Transition;
		});

		var initial_state = state_list.findElement(function(element) {
			return container.getInitialState() != undefined
				&& container.getInitialState().getStateName() == element.getStateName();
		});

		var transitions_out = container.getTransitions().filter(function(t) {
			return transition_list.findElement(function(el) { return el.getFrom() == t.getFrom() && el.getOutcome() == t.getOutcome(); }) == undefined
				&& state_list.findElement(function(el) { return el.getStateName() == t.getFrom().getStateName(); }) != undefined;
		});
		var transitions_in = container.getTransitions().filter(function(t) {
			return t.getFrom().getStateName() != "INIT"
				&& transition_list.findElement(function(el) { return el.getFrom() == t.getFrom() && el.getOutcome() == t.getOutcome(); }) == undefined
				&& state_list.findElement(function(el) { return el.getStateName() == t.getTo().getStateName(); }) != undefined;
		});

		deleteAll(clipboard);

		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Cut " + paste_clipboard.length + " elements",
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				var pasted_elements = pasteAll(paste_clipboard, container);
				var pasted_states = pasted_elements.filter(function(s) {
					return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
				});
				if (initial_state != undefined) {
					container.setInitialState(pasted_states.findElement(function(s) {
						return s.getStateName() == initial_state.getStateName();
					}));
				}
				transitions_in.forEach(function(t) {
					t.setFrom(container.getStateByName(t.getFrom().getStateName()));
					t.setTo(pasted_states.findElement(function(s) { return s.getStateName() == t.getTo().getStateName(); }));
					container.addTransition(t);
				});
				transitions_out.forEach(function(t) {
					t.setFrom(pasted_states.findElement(function(s) { return s.getStateName() == t.getFrom().getStateName(); }));
					var out_target = container.getStateByName(t.getTo().getStateName());
					if (out_target == undefined) out_target = container.getSMOutcomeByName(t.getTo().getStateName());
					t.setTo(out_target);
					container.addTransition(t);
				});

				UI.Statemachine.refreshView();
			},
			function() {
				var delete_clipboard = history_clipboard.map(function (element) {
					return (element instanceof Transition)? element : Behavior.getStatemachine().getStateByPath(element);
				});
				deleteAll(delete_clipboard);
			}
		);
	}

	this.paste = function() {
		if (clipboard == undefined) return;
		if (clipboard.length == 0) return;

		var container_path = UI.Statemachine.getDisplayedSM().getStatePath();

		var paste_clipboard = pasteAll(clipboard, UI.Statemachine.getDisplayedSM());

		var history_clipboard = paste_clipboard.map(function (element) {
			return (element instanceof Transition)? element : element.getStatePath();
		});

		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Pasted " + paste_clipboard.length + " elements",
			function() {
				var delete_clipboard = history_clipboard.map(function (element) {
					return (element instanceof Transition)? element : Behavior.getStatemachine().getStateByPath(element);
				});
				deleteAll(delete_clipboard);
			},
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				pasteAll(paste_clipboard, container);
			}
		);
	}

	this.groupSelection = function() {
		var selection = UI.Statemachine.getSelectedStatesAndTransitions();
		if(RC.Controller.isRunning()) {
			var locked_state = selection.findElement(function(el) {
				return ((el instanceof State) || (el instanceof Statemachine) || (el instanceof BehaviorState))
					&& RC.Controller.isOnLockedPath(el.getStatePath());
			});
			if (locked_state != undefined) {
				selection.remove(locked_state);
				selection.filter(function(el) {
					return (el instanceof Transition)
						&& (el.getFrom().getStateName() == locked_state.getStateName()
							|| el.getTo().getStateName() == locked_state.getStateName());
				}).forEach(function(t) { selection.remove(t); });
			}
		}
		if (selection.length == 0) return;

		let container = UI.Statemachine.getDisplayedSM();
		let container_path = container.getStatePath();

		// let history_selection = selection.map(function (element) {
		// 	return (element instanceof Transition)? element : element.getStatePath();
		// });

		let state_list = selection.filter(function(s) {
			return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
		});
		let transition_list = selection.filter(function(t) {
			return t instanceof Transition;
		});

		let initial_state = state_list.findElement(function(element) {
			return container.getInitialState() != undefined
				&& container.getInitialState().getStateName() == element.getStateName();
		});

		let transitions_out = container.getTransitions().filter(function(t) {
			return transition_list.findElement(function(el) { return el.getFrom() == t.getFrom() && el.getOutcome() == t.getOutcome(); }) == undefined
				&& state_list.findElement(function(el) { return el.getStateName() == t.getFrom().getStateName(); }) != undefined;
		});
		let transitions_in = container.getTransitions().filter(function(t) {
			return t.getFrom().getStateName() != "INIT"
				&& transition_list.findElement(function(el) { return el.getFrom() == t.getFrom() && el.getOutcome() == t.getOutcome(); }) == undefined
				&& state_list.findElement(function(el) { return el.getStateName() == t.getTo().getStateName(); }) != undefined;
		});

		container.updateDataflow();
		let dataflow_out = container.getDataflow().filter(function(d) {
			return state_list.contains(d.getFrom()) && !state_list.contains(d.getTo());
		});
		let dataflow_in = container.getDataflow().filter(function(d) {
			return !state_list.contains(d.getFrom()) && state_list.contains(d.getTo());
		});

		let sm_name = that.getUniqueName(container, 'Group');
		let sm_outcomes = transitions_out.map(t => t.getOutcome()).reduce((p,c) => (p.contains(c)? p : p.concat(c)), []);
		let sm_input_keys = dataflow_in.map(t => t.getOutcome()).reduce((p,c) => (p.contains(c)? p : p.concat(c)), []);;
		let sm_output_keys = dataflow_out.map(t => t.getOutcome()).reduce((p,c) => (p.contains(c)? p : p.concat(c)), []);;
		let sm_def = new WS.StateMachineDefinition(sm_outcomes, sm_input_keys, sm_output_keys);
		let sm = new Statemachine(sm_name, sm_def);
		sm.setPosition({x: state_list[0].getPosition().x, y: state_list[0].getPosition().y});
		container.addState(sm);
		UI.Panels.StateProperties.displayStateProperties(sm);

		let min_x = state_list.map(s => s.getPosition().x).reduce((p,c) => Math.min(p,c));
		let min_y = state_list.map(s => s.getPosition().y).reduce((p,c) => Math.min(p,c));
		state_list.forEach(function(state) {
			state.translate(-min_x + 30, -min_y + 40);
		});

		state_list.forEach(container.removeState);
		sm_outcomes.forEach(function(oc) {
			var transition = transitions_out.findElement(t => t.getOutcome() == oc);
			container.addTransition(new Transition(sm, transition.getTo(), oc, -1));
		});
		transitions_in.forEach(function(transition) {
			container.addTransition(new Transition(transition.getFrom(), sm, transition.getOutcome(), transition.getAutonomy()));
		});
		if (initial_state != undefined) container.setInitialState(sm);

		//let pasted_elements = pasteAll(selection, sm);
		if (transitions_in.length > 0) {
			var init_state_name = transitions_in[0].getTo().getStateName();
			sm.setInitialState(sm.getStateByName(init_state_name));
		}
		ActivityTracer.doNotTrace(function() {
			that.autoconnect(sm);
		});
		UI.Statemachine.refreshView();
		UI.Statemachine.removeSelection();

		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Grouped " + state_list.length + " states",
			function() { // undo
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let sm = container.getStateByName(sm_name);
				if (UI.Statemachine.getDisplayedSM().getStatePath() == sm.getStatePath()) {
					UI.Statemachine.setDisplayedSM(sm.getContainer());
				}
				container.removeState(sm);
				selection.forEach(function(s) {
					if((s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState))
						s.translate(min_x - 30, min_y - 40);
				});
				let pasted_elements = pasteAll(selection, container);
				let pasted_states = pasted_elements.filter(function(s) {
					return (s instanceof State) || (s instanceof Statemachine) || (s instanceof BehaviorState);
				});
				if (initial_state != undefined) {
					container.setInitialState(pasted_states.findElement(function(s) {
						return s.getStateName() == initial_state.getStateName();
					}));
				}
				transitions_in.forEach(function(t) {
					t.setFrom(container.getStateByName(t.getFrom().getStateName()));
					t.setTo(pasted_states.findElement(function(s) { return s.getStateName() == t.getTo().getStateName(); }));
					container.addTransition(t);
				});
				transitions_out.forEach(function(t) {
					t.setFrom(pasted_states.findElement(function(s) { return s.getStateName() == t.getFrom().getStateName(); }));
					var out_target = container.getStateByName(t.getTo().getStateName());
					if (out_target == undefined) out_target = container.getSMOutcomeByName(t.getTo().getStateName());
					t.setTo(out_target);
					container.addTransition(t);
				});

				UI.Statemachine.refreshView();
			},
			function() { // redo
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let sm_def = new WS.StateMachineDefinition(sm_outcomes, sm_input_keys, sm_output_keys);
				let sm = new Statemachine(sm_name, sm_def);
				sm.setPosition({x: state_list[0].getPosition().x, y: state_list[0].getPosition().y});
				container.addState(sm);
				state_list.forEach(function(state) {
					state.translate(-min_x + 30, -min_y + 40);
				});
				state_list.forEach(function(s) {
					let state = container.getStateByName(s.getStateName());
					container.removeState(state);
				});
				sm_outcomes.forEach(function(oc) {
					let transition = transitions_out.findElement(t => t.getOutcome() == oc);
					let t_to = container.getStateByName(transition.getTo().getStateName());
					if (t_to == undefined) t_to = container.getSMOutcomeByName(transition.getTo().getStateName());
					container.addTransition(new Transition(sm, t_to, oc, -1));
				});
				transitions_in.forEach(function(transition) {
					let t_from = container.getStateByName(transition.getFrom().getStateName());
					container.addTransition(new Transition(t_from, sm, transition.getOutcome(), transition.getAutonomy()));
				});
				if (initial_state != undefined) container.setInitialState(sm);

				let pasted_elements = pasteAll(selection, sm);
				if (transitions_in.length > 0) {
					let init_state_name = transitions_in[0].getTo().getStateName();
					sm.setInitialState(sm.getStateByName(init_state_name));
				}
				that.autoconnect(sm);

				UI.Statemachine.refreshView();
			}
		);
	}

	this.createStatemachine = function(name) {
		let prev_clipboard = clipboard;
		that.cut();
		if (clipboard.length == 0) {
			T.clearLog();
			T.show();
			T.logWarn("No states selected!");
			clipboard = prev_clipboard;
			return;
		}
		let cb_states = clipboard.filter(function(element) {
			return element instanceof State;
		});
		let sm_position = {x: cb_states[0].getPosition().x, y: cb_states[0].getPosition().y};

		let sm = UI.Menu.addStatemachineClicked();
		sm.setPosition(sm_position);
		UI.Panels.StateProperties.displayStateProperties(sm);
		if (name != undefined) {
			document.getElementById("input_prop_sm_name").value = name;
			UI.Panels.StateProperties.statePropNameChanged();
		}
		UI.Panels.StateProperties.openStatemachine();
		that.paste();
		UI.Statemachine.setDisplayedSM(sm.getContainer());
		if (name == undefined) {
			UI.Panels.StateProperties.displayStateProperties(sm);
		}
		clipboard = prev_clipboard;
	}

	this.autoconnect = function(target_sm) {
		let getClosestState = function(pos, state) {
			let dist = undefined;
			let closest = undefined;
			sm.getStates().forEach(function(other, j) {
				if (state != undefined) {
					if (state.getStateName() == other.getStateName()) return;
					if (sm.getStates().indexOf(state) > j) return;
					let transition = sm.getTransitions().findElement(function (element) {
						return element.getFrom() == other && element.getTo() == state;
					});
					if (transition != undefined) return;
				}
				let other_dist = Math.sqrt(Math.pow(other.getPosition().x - pos.x, 2) + Math.pow(other.getPosition().y - pos.y, 2));
				if (dist == undefined || dist > other_dist) {
					dist = other_dist;
					closest = other;
				}
			});
			return closest;
		};
		let new_transitions = [];
		let sm = (target_sm == undefined)? UI.Statemachine.getDisplayedSM() : target_sm;
		let sm_path = sm.getStatePath();
		sm.getStates().forEach(function(state) {
			let unconnected = state.getOutcomesUnconnected().clone();
			unconnected.forEach(function(outcome, i) {
				if (sm.getOutcomes().contains(outcome)) {
					new_transitions.push({from: state.getStateName(), to: outcome, outcome: outcome});
				} else if (i == 0) {
					let closest = getClosestState(state.getPosition(), state);
					if (closest != undefined && !sm.isConcurrent()) {
						new_transitions.push({from: state.getStateName(), to: closest.getStateName(), outcome: outcome});
					}
				}
			});
		});
		new_transitions.forEach(function(t) {
			if (sm.getOutcomes().contains(t.to)) {
				sm.addTransition(new Transition(
					sm.getStateByName(t.from),
					sm.getSMOutcomeByName(t.to),
					t.outcome,
					sm.getStateByName(t.from).getAutonomy()[sm.getStateByName(t.from).getOutcomes().indexOf(t.outcome)]
				));
				if (sm.isConcurrent()) sm.tryDuplicateOutcome(t.outcome);
			} else {
				sm.addTransition(new Transition(
					sm.getStateByName(t.from),
					sm.getStateByName(t.to),
					t.outcome,
					sm.getStateByName(t.from).getAutonomy()[sm.getStateByName(t.from).getOutcomes().indexOf(t.outcome)]
				));
			}
		});

		let initial_name = undefined;
		if (sm.getInitialState() == undefined) {
			let closest = getClosestState({x: 0, y: 0});
			sm.setInitialState(closest);
			initial_name = closest.getStateName();
		}
		if (new_transitions.length == 0 && initial_name == undefined) return;

		UI.Statemachine.refreshView();

		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Connected " + new_transitions.length + " outcomes",
			function() { // undo
				let sm = (sm_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(sm_path);
				new_transitions.forEach(function(t) {
					var from_state = sm.getStateByName(t.from);
					from_state.unconnect(t.outcome);
					sm.removeTransitionFrom(from_state, t.outcome);
				});
				if (initial_name != undefined) sm.setInitialState(undefined);
				UI.Statemachine.refreshView();
			},
			function() { // redo
				let sm = (sm_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(sm_path);
				new_transitions.forEach(function(t) {
					if (sm.getOutcomes().contains(t.to)) {
						sm.addTransition(new Transition(
							sm.getStateByName(t.from),
							sm.getSMOutcomeByName(t.to),
							t.outcome,
							sm.getStateByName(t.from).getAutonomy()[sm.getStateByName(t.from).getOutcomes().indexOf(t.outcome)]
						));
						if (sm.isConcurrent()) sm.tryDuplicateOutcome(t.outcome);
					} else {
						sm.addTransition(new Transition(
							sm.getStateByName(t.from),
							sm.getStateByName(t.to),
							t.outcome,
							sm.getStateByName(t.from).getAutonomy()[sm.getStateByName(t.from).getOutcomes().indexOf(t.outcome)]
						));
					}
				});
				if (initial_name != undefined) {
					sm.setInitialState(sm.getStateByName(initial_name));
				}
				UI.Statemachine.refreshView();
			}
		);
	}

	this.getUniqueName = function(sm, state_name) {
		if (sm.getStateByName(state_name) != undefined) {
			let name_pattern = new RegExp(/^/i.source + state_name + /(?:_(\d+))?$/i.source);
			let current_state_list = sm.getStates();
			current_state_list = current_state_list.map(function(element) {
				let result = element.getStateName().match(name_pattern);
				if (result == null) return 0;
				if (result[1] == undefined) return 1;
				return parseInt(result[1]);
			});
			let new_index = current_state_list.reduce(function(prev, cur) {
				return prev > cur? prev : cur;
			}, 0) + 1;
			return state_name + ((new_index>1)? "_" + new_index : "");
		}
		return state_name;
	}

	this.getClipboard = function() {
		return clipboard;
	}

	this.viewSource = function(state_type, file_path, code_text) {
		const html1 = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
		<meta charset="UTF-8">
		<title>`;

		const html2 = `</title>
		<style>
			body {
				font-family: Arial, sans-serif;
				fontSize: '12px';
				margin: 20px;
			}
			content {
				user-select: auto; /* Ensure text is selectable */
				background-color: lightblue;
			}
			pre, code {
				font-family: 'Courier New', Courier, monospace;
				background-color: #f4f4f4;
				padding: 10px;
				border-radius: 5px;
				overflow: auto;
			}

		</style>
		</head>
		<body>
		<h5><b>`

		const html2b = `</b></h5>
		  <p>`;

		const html3 = `
		</p>
		</body>
		</html>`;

		let html_response = html1 + state_type + html2;
		html_response += state_type + ' : ' + file_path;
		html_response += html2b + code_text + html3;
		const new_window = window.open('', '_blank');
		new_window.document.write(html_response);
		new_window.document.close();

	}
}) ();