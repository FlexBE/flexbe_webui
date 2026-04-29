const Statemachine = function(sm_name, sm_definition) {
	State.apply(this, [sm_name, sm_definition]);
	var that = this;

	var states = [];
	var state_map = new Map();
	var transitions = [];
	transitions.push(new Transition(new State("INIT", WS.Statelib.getFromLib(":INIT")), undefined, "", 0));
	var dataflow = [];

	var concurrent = false;
	var priority = false;

	var initial_state = undefined;
	var sm_outcomes = [];
	var outcome_copy_normalization_suspended = false;

	var addSMOutcome = function(outcome) {
		var outcome_state = new State(outcome + (concurrent? ('#' + sm_outcomes.length) : ''), WS.Statelib.getFromLib(concurrent? ":CONDITION" : ":OUTCOME"));
		//outcome_state.setPosition({x: 30 + sm_outcomes.length * 100, y: UI.Statemachine.getR().height / 2});
		outcome_state.setPosition({x: UI.Statemachine.getR().width - 50, y: (1 + sm_outcomes.length) * UI.Statemachine.getR().height / 10});
		sm_outcomes.push(outcome_state);
		outcome_state.setContainer(that);
	}
	var generateSMOutcomes = function() {
		sm_outcomes = [];
		for (var i = 0; i < sm_definition.getOutcomes().length; i++) {
			addSMOutcome(sm_definition.getOutcomes()[i]);
		}
	}
	generateSMOutcomes();

	var copyPoint = function(point) {
		if (point == undefined) {
			return undefined;
		}
		return {x: point.x, y: point.y};
	}

	var serializeTransition = function(transition, index) {
		var beginning = transition.getBeginning();
		var end = transition.getEnd();
		return {
			index: index,
			from: transition.getFrom().getStateName(),
			to: transition.getTo() ? transition.getTo().getStateName() : undefined,
			outcome: transition.getOutcome(),
			autonomy: transition.getAutonomy(),
			x: transition.getX(),
			y: transition.getY(),
			beginning: copyPoint(beginning),
			end: copyPoint(end)
		};
	}

	var restoreTransition = function(container, transition_data) {
		var from = transition_data.from == "INIT"
			? container.getInitialTransition().getFrom()
			: container.getStateByName(transition_data.from);
		var to = transition_data.to == undefined
			? undefined
			: container.getStateByName(transition_data.to);
		if (to == undefined && transition_data.to != undefined) {
			to = container.getSMOutcomeByName(transition_data.to);
		}
		if (from == undefined || (transition_data.to != undefined && to == undefined)) {
			T.debugWarn("Failed to restore transition from '" + transition_data.from
				+ "' to '" + transition_data.to + "' in " + container.getStateName());
			return undefined;
		}
		return new Transition(
			from,
			to,
			transition_data.outcome,
			transition_data.autonomy,
			transition_data.x,
			transition_data.y,
			transition_data.beginning ? transition_data.beginning.x : undefined,
			transition_data.beginning ? transition_data.beginning.y : undefined,
			transition_data.end ? transition_data.end.x : undefined,
			transition_data.end ? transition_data.end.y : undefined
		);
	}

	var insertOutcomeReference = function(list, outcome, outcome_index) {
		var insert_index = list.length;
		for (var i = 0; i < list.length; ++i) {
			if (that.getOutcomes().indexOf(list[i]) > outcome_index) {
				insert_index = i;
				break;
			}
		}
		list.splice(insert_index, 0, outcome);
	}

	var clearTransitions = function() {
		states.forEach(that.removeConnectedTransitions);
	}

	// States
	this.getInitialState = function() {
		return initial_state;
	}
	this.setInitialState = function(_initial_state) {
		initial_state = _initial_state;
		var init_trans = that.getInitialTransition();
		if (init_trans != undefined) {
			init_trans.setTo(initial_state);
		} else {
			T.debugWarn("Could not find initial transition.");
		}
	}

	this.getStateByName = function(name) {
		return state_map.get(name);
	}

	this.getStateById = function(id) {
		for(var i=0; i<states.length; ++i) {
			if (states[i].getStateId() === id || String(states[i].getStateId()) === id)
				// allow numeric or string version of id parameter
				return states[i];
		}
		return undefined;
	}

	this.getStateByPath = function(path) {
		var path_elements = path.split("/");

		if (path_elements[0] != that.getStateName()) {
			T.debugWarn("Path '" + path + "' does not match to " + that.getStateName());
			return undefined;
		}

		if (path_elements.length == 1) {
			T.debugWarn("Invalid path: " + path);
			return undefined;
		}

		if (path_elements.length == 2)
			return that.getStateByName(path_elements[1]);

		var child = that.getStateByName(path_elements[1]);
		if (child instanceof BehaviorState) {
			child = child.getBehaviorStatemachine();
		}
		return child.getStateByPath(path.slice(that.getStateName().length + 1));
	}

	this.traverseStates = function(_filter) {
		var result = [];
		for(var i=0; i<states.length; ++i) {
			if (states[i] instanceof Statemachine) {
				result = result.concat(states[i].traverseStates(_filter));
				continue;
			} else if (states[i] instanceof BehaviorState) {
				continue;
			}
			if (_filter(states[i])) {
				result.push(states[i]);
			}
		}
		return result;
	}

	this.addState = function(state) {
		states.push(state);
		state_map.set(state.getStateName(), state);
		state.setContainer(that);
	}
	this.removeState = function(state) {
		states.remove(state);
		state_map.delete(state.getStateName());
		state.setContainer(undefined);
		if (initial_state != undefined && initial_state.getStateName() == state.getStateName())
			initial_state = undefined;

		// remove connected transitions
		that.removeConnectedTransitions(state);
	}
	this.notifyStateRenamed = function(old_name, new_name, state) {
		state_map.delete(old_name);
		state_map.set(new_name, state);
	}

	// Transitions
	this.getInitialTransition = function() {
		return transitions.findElement(function (element) {
			return element.getOutcome() == "" && element.getFrom().getStateName() == "INIT";
		});
	}

	this.hasTransition = function(transition) {
		return transitions.findElement(function(element) {
			return element.getFrom().getStateName() == transition.getFrom().getStateName()
				&& element.getOutcome() == transition.getOutcome();
		}) != undefined;
	}

	this.addTransition = function(transition) {
		if (that.hasTransition(transition)) {
			T.debugWarn("Trying to add already existing transition from state '" + transition.getFrom().getStateName() + "', outcome '" + transition.getOutcome() + "'");
			return;
		}
		transitions.push(transition);
		transition.getFrom().connect(transition.getOutcome());
		var target_outcome = getSequentialOutcomeBaseName(transition.getTo());
		if (target_outcome != undefined) {
			normalizeOutcomeCopies(target_outcome);
		}
	}

	var addSMOutcomeCopy = function(name) {
		var existing = sm_outcomes.filter(function(s) {
			return s.getStateName() === name || s.getStateName().startsWith(name + '#');
		});
		var next_copy_index = existing.reduce(function(max_index, state) {
			var state_name = state.getStateName();
			if (state_name === name) {
				return max_index;
			}
			return Math.max(max_index, parseInt(state_name.split('#')[1], 10));
		}, 0) + 1;
		var copy_name = name + '#' + next_copy_index;
		var outcome_state = new State(copy_name, WS.Statelib.getFromLib(":OUTCOME"));
		var last = existing[existing.length - 1];
		var gridsize = (UI.Statemachine && UI.Statemachine.getGridSize) ? UI.Statemachine.getGridSize() : 50;
		outcome_state.setPosition({x: last.getPosition().x, y: last.getPosition().y + gridsize * 3});
		sm_outcomes.push(outcome_state);
		outcome_state.setContainer(that);
	}

	var withOutcomeCopyNormalizationSuspended = function(callback) {
		var previous = outcome_copy_normalization_suspended;
		outcome_copy_normalization_suspended = true;
		try {
			return callback();
		} finally {
			outcome_copy_normalization_suspended = previous;
		}
	}

	var getSequentialOutcomeBaseName = function(target) {
		if (concurrent || target == undefined || !sm_outcomes.contains(target)) {
			return undefined;
		}
		return target.getStateName().split('#')[0];
	}

	var normalizeOutcomeCopies = function(outcome) {
		if (concurrent || outcome_copy_normalization_suspended) {
			return;
		}
		var outcome_states = sm_outcomes.filter(function(state) {
			return state.getStateName() === outcome || state.getStateName().startsWith(outcome + '#');
		});
		if (outcome_states.length == 0) {
			return;
		}
		var free_outcomes = outcome_states.clone();
		transitions.forEach(function(transition) {
			if (free_outcomes.contains(transition.getTo())) {
				free_outcomes.remove(transition.getTo());
			}
		});
		if (free_outcomes.length == 0) {
			addSMOutcomeCopy(outcome);
			return;
		}
		while (free_outcomes.length > 1) {
			sm_outcomes.remove(free_outcomes.pop());
		}
	}

	this.tryDuplicateOutcome = function(outcome) {
		if (!concurrent) {
			normalizeOutcomeCopies(outcome);
			return;
		}
		let outcome_states = sm_outcomes.filter(function(state) {
			return state.getStateName() === outcome || state.getStateName().startsWith(outcome + '#');
		});
		transitions.forEach(function(transition) {
			if (outcome_states.contains(transition.getTo())) {
				outcome_states.remove(transition.getTo());
			}
		});
		if (outcome_states.length == 0) {
			if (concurrent) {
				addSMOutcome(outcome);
			} else {
				addSMOutcomeCopy(outcome);
			}
		}
	}

	this.removeTransitionObject = function(transition) {
		var target_outcome = getSequentialOutcomeBaseName(transition.getTo());
		transitions.remove(transition);
		transition.getFrom().unconnect(transition.getOutcome());
		if (target_outcome != undefined) {
			normalizeOutcomeCopies(target_outcome);
		}
	}

	this.removeTransitionFrom = function(state, outcome) {
		let trans = transitions.findElement(function(element) {
			return element.getFrom() == state && element.getOutcome() == outcome;
		});
		if (trans != undefined) {
			var target_outcome = getSequentialOutcomeBaseName(trans.getTo());
			transitions.remove(trans);
			if (target_outcome != undefined) {
				normalizeOutcomeCopies(target_outcome);
			}
		}
	}

	this.retargetTransition = function(transition, target) {
		var previous_outcome = getSequentialOutcomeBaseName(transition.getTo());
		transition.setTo(target);
		if (concurrent || outcome_copy_normalization_suspended) {
			return;
		}
		var next_outcome = getSequentialOutcomeBaseName(target);
		if (previous_outcome != undefined) {
			normalizeOutcomeCopies(previous_outcome);
		}
		if (next_outcome != undefined && next_outcome != previous_outcome) {
			normalizeOutcomeCopies(next_outcome);
		}
	}
	this.removeConnectedTransitions = function(state) {
		let to_remove = transitions.filter(function (element) {
			return element.getFrom() == state || element.getTo() == state;
		});
		to_remove.forEach(function (element, i) {
			if (element.getOutcome() == "" && element.getFrom().getStateName() == "INIT") {
				that.setInitialState(undefined);
			} else {
				that.removeTransitionObject(element);
			}
		});
	}

	// Userdata
	this.getDataflow = function() {
		return dataflow;
	}

	this.updateDataflow = function() {
		dataflow = [];
		states.forEach(function(state) {
			var added_keys = []
			state.getInputMapping().forEach(function(key, i) {
				if (added_keys.contains(key)) return;
				if (state instanceof BehaviorState && key == undefined) return;
				added_keys.push(key);
				addDataEdgeForPredecessors(state, state, key, []);
			});
		});
		sm_outcomes.forEach(function(outcome) {
			that.getOutputKeys().forEach(function(key) {
				addDataEdgeForPredecessors(outcome, outcome, key, []);
			});
		});
	}

	var addDataEdgeForPredecessors = function(state, target, key, checked) {
		if (concurrent) {
			var init = that.getInitialTransition().getFrom();
			// in concurrency, userdata always needs to be given from container keys
			dataflow.push(new Transition(init, target, key, 0));
		} else {
			transitions.forEach(function(trans) {
				if (trans.getTo() == undefined || trans.getTo().getStateName() != state.getStateName()) return;
				if (trans.getFrom().getStateName() == "INIT") {
					dataflow.push(new Transition(trans.getFrom(), target, key, 0));
				} else if (!checked.contains(trans.getFrom().getStateName())) {
					checked.push(trans.getFrom().getStateName());
					if (trans.getFrom().getOutputMapping().contains(key)) {
						dataflow.push(new Transition(trans.getFrom(), target, key, 0));
					} else {
						addDataEdgeForPredecessors(trans.getFrom(), target, key, checked);
					}
				}
			});
		}
	}


	// Interface
	this.getSMOutcomes = function() {
		return sm_outcomes;
	}
	this.setSMOutcomes = function(_sm_outcomes) {
		sm_outcomes = _sm_outcomes;
	}

	this.withOutcomeCopyNormalizationSuspended = function(callback) {
		return withOutcomeCopyNormalizationSuspended(callback);
	}

	this.getSMOutcomeByName = function(name) {
		for(var i=0; i<sm_outcomes.length; ++i) {
			if ((sm_outcomes[i].getStateName() == name)
			|| (concurrent && name.indexOf('#') == -1 && sm_outcomes[i].getStateName().startsWith(name)))
				return sm_outcomes[i];
		}
		T.debugWarn("Outcome '" + name + "' not found in " + that.getStateName());
	}

	this.addOutcome = function(outcome) {
		sm_definition.addOutcome(outcome);
		var outcome_state = new State(outcome, WS.Statelib.getFromLib(concurrent? ":CONDITION" : ":OUTCOME"));
		//outcome_state.setPosition({x: 30 + sm_outcomes.length * 100, y: UI.Statemachine.getR().height / 2});
		outcome_state.setPosition({x: UI.Statemachine.getR().width - 50, y: (1 + sm_outcomes.length) * UI.Statemachine.getR().height / 10});
		outcome_state.setContainer(that);
		sm_outcomes.push(outcome_state);
		that.getOutcomes().push(outcome);
		that.getOutcomesUnconnected().push(outcome);
		that.getAutonomy().push(-1);
	}

	this.removeOutcome = function(outcome) {
		var outcome_index = that.getOutcomes().indexOf(outcome);
		if (outcome_index == -1) {
			T.debugWarn("Trying to remove unavailable outcome '" + outcome + "' from " + that.getStateName());
			return undefined;
		}
		var removed = {
			outcome: outcome,
			outcome_index: outcome_index,
			autonomy: that.getAutonomy()[outcome_index],
			sm_outcomes: [],
			transitions: [],
			container_transition: undefined
		};
		var parent_container = that.getContainer();
		if (parent_container != undefined) {
			var parent_transition = parent_container.getTransitions().findElement(function(element) {
				return element.getFrom() == that && element.getOutcome() == outcome;
			});
			if (parent_transition != undefined) {
				removed.container_transition = serializeTransition(parent_transition);
			}
		}

		// remove transition away
		if (parent_container != undefined) {
			parent_container.removeTransitionFrom(that, outcome);
		}
		// remove all copies (base name and any #N variants)
		var copies = sm_outcomes.filter(function(element) {
			return element.getStateName() === outcome || element.getStateName().startsWith(outcome + '#');
		});
		copies.forEach(function(old_element) {
			removed.sm_outcomes.push({
				name: old_element.getStateName(),
				state_class: old_element.getStateClass(),
				position: copyPoint(old_element.getPosition()),
				index: sm_outcomes.indexOf(old_element)
			});
		});
		transitions.forEach(function(transition, index) {
			if (copies.contains(transition.getTo())) {
				removed.transitions.push(serializeTransition(transition, index));
			}
		});
		copies.forEach(function(old_element) {
			sm_outcomes.remove(old_element);
			that.removeConnectedTransitions(old_element);
		});

		// remove outcome
		that.getOutcomes().remove(outcome);
		if (that.getOutcomesUnconnected().contains(outcome))
			that.getOutcomesUnconnected().remove(outcome);
		else
			that.getOutcomesConnected().remove(outcome);

		sm_definition.removeOutcome(outcome);
		return removed;
	}

	this.restoreOutcome = function(removed) {
		if (removed == undefined || removed.outcome == undefined) {
			return;
		}
		if (that.getOutcomes().contains(removed.outcome)) {
			T.debugWarn("Trying to restore already existing outcome '" + removed.outcome + "' in " + that.getStateName());
			return;
		}

		var outcome_index = Math.min(removed.outcome_index, that.getOutcomes().length);
		that.getOutcomes().splice(outcome_index, 0, removed.outcome);
		that.getAutonomy().splice(outcome_index, 0, removed.autonomy);
		insertOutcomeReference(that.getOutcomesUnconnected(), removed.outcome, outcome_index);
		if (sm_definition.insertOutcome != undefined) {
			sm_definition.insertOutcome(removed.outcome, Math.min(removed.outcome_index, sm_definition.getOutcomes().length));
		} else {
			sm_definition.addOutcome(removed.outcome);
		}

		withOutcomeCopyNormalizationSuspended(function() {
			removed.sm_outcomes.sort(function(a, b) {
				return a.index - b.index;
			}).forEach(function(outcome_state) {
				var restored = new State(outcome_state.name, WS.Statelib.getFromLib(outcome_state.state_class));
				restored.setPosition(copyPoint(outcome_state.position));
				restored.setContainer(that);
				sm_outcomes.splice(Math.min(outcome_state.index, sm_outcomes.length), 0, restored);
			});

			removed.transitions.sort(function(a, b) {
				return a.index - b.index;
			}).forEach(function(transition_data) {
				var restored = restoreTransition(that, transition_data);
				if (restored != undefined) {
					that.addTransition(restored);
				}
			});
		});
		normalizeOutcomeCopies(removed.outcome);

		if (removed.container_transition != undefined && that.getContainer() != undefined) {
			var restored_transition = restoreTransition(that.getContainer(), removed.container_transition);
			if (restored_transition != undefined) {
				that.getContainer().addTransition(restored_transition);
			}
		}
	}

	this.updateOutcome = function(outcome_old, outcome_new) {
		sm_outcomes.forEach(function(element) {
			var name = element.getStateName();
			if (name === outcome_old) {
				element.setStateName(outcome_new);
			} else if (name.startsWith(outcome_old + '#')) {
				element.setStateName(outcome_new + '#' + name.split('#')[1]);
			}
		});
		var outcome_index = that.getOutcomes().indexOf(outcome_old);
		if (outcome_index != -1) {
			that.getOutcomes()[outcome_index] = outcome_new;
		}
		var unconnected_index = that.getOutcomesUnconnected().indexOf(outcome_old);
		if (unconnected_index != -1) {
			that.getOutcomesUnconnected()[unconnected_index] = outcome_new;
		}
		var connected_index = that.getOutcomesConnected().indexOf(outcome_old);
		if (connected_index != -1) {
			that.getOutcomesConnected()[connected_index] = outcome_new;
		}
		var definition_index = sm_definition.getOutcomes().indexOf(outcome_old);
		if (definition_index != -1) {
			sm_definition.getOutcomes()[definition_index] = outcome_new;
		}
	}

	this.isPriority = function() {
		return priority;
	}

	this.setPriority = function(new_priority) {
		priority = new_priority;
	}

	this.isConcurrent = function() {
		return concurrent;
	}

	this.setConcurrent = function(new_concurrent) {
		concurrent = new_concurrent;

		clearTransitions();
		generateSMOutcomes();
	}

	this.getConditions = function() {
		var conditions = {
			outcomes: [],
			transitions: []
		}
		transitions.forEach(function(t) {
			if (t.getOutcome() == "") return;
			if (conditions.outcomes.contains(t.getTo().getStateName())) {
				var idx = conditions.outcomes.indexOf(t.getTo().getStateName());
				conditions.transitions[idx].push([t.getFrom().getStateName(), t.getOutcome()]);
			} else {
				conditions.outcomes.push(t.getTo().getStateName());
				conditions.transitions.push([[t.getFrom().getStateName(), t.getOutcome()]]);
			}
		});
		return conditions;
	}

	this.setConditions = function(conditions) {
		var additional_outcomes = [];
		for (var i = 0; i < conditions.outcomes.length; i++) {
			var o = conditions.outcomes[i];
			var t = conditions.transitions[i];
			if (additional_outcomes.contains(o)) {
				addSMOutcome(o);
				t.forEach(function(so) {
					that.addTransition(new Transition(that.getStateByName(so[0]), sm_outcomes[sm_outcomes.length-1], so[1], 0));
				});
			} else {
				let o_label = sm_outcomes.findElement(function(oc) {
					return oc.getStateName().startsWith(o + '#');
				});
				t.forEach(function(so) {
					that.addTransition(new Transition(that.getStateByName(so[0]), o_label, so[1], 0));
				});
				additional_outcomes.push(o);
			}
		}
		additional_outcomes.forEach(addSMOutcome);
	}

	//var temp = this.toJSON();

	this.toJSON = function() {
		var current = this.toBaseJSON();
		current ["states"] = states;
		current ["transitions"] = transitions;
	 	current ["dataflow"] = dataflow;
		current ["concurrent"] = concurrent;
		current ["priority"] = priority;
		current ["initial_state"] = initial_state;
		current ["sm_outcomes"] = sm_outcomes;
		current ["conditions"] = this.getConditions();
		return current;
	}

	//
	//	DEPRECATED
	//

	this.getStates = function() {
		//T.debugWarn("DEPRECATED: " + "getStates");
		return states;
	}
	this.setStates = function(_states) {
		T.debugWarn("DEPRECATED: " + "setStates");
		states = _states;
		state_map = new Map();
		states.forEach(function(s) { state_map.set(s.getStateName(), s); });
	}

	this.getTransitions = function() {
		//T.debugWarn("DEPRECATED: " + "getTransitions");
		return transitions;
	}
	this.setTransitions = function(_transitions) {
		T.debugWarn("DEPRECATED: " + "setTransitions");
		transitions = _transitions;
	}

};
Statemachine.prototype = Object.create(State.prototype);
