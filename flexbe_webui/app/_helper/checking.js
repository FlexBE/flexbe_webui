const Checking = new (function() {
	var that = this;
	var flagWarning = false;

	const python_varname_pattern = /^[a-z_][a-z0-9_]*$/i;

	const python_reserved_list = ["and", "assert", "break", "class", "continue", "def", "del", "elif",
			 "else", "except", "exec", "finally", "for", "from", "global", "if",
			 "import", "in", "is", "lambda", "not", "or", "pass", "print",
			 "raise", "return", "try", "while", "yield"];
	// these allow mixed capitalization unlike basic variable test
	const referenceNamePattern = /^([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/;
	const indexedVariablePattern = /^([a-zA-Z_][a-zA-Z0-9_]*)(\[[^\]]+\])+$/;
	var variables;

	this.checkBehavior = function() {
		try {
			console.log(`Checking '${Behavior.getBehaviorName()}' behavior ...`);
			// Store variables that class definitions we are likely to encounter in setup
			that.variables = new Set();
			that.variables.add('self'); // self is always a valid variable
			that.variables.add('_state_machine'); // state machine is always valid variable
			that.variables.add('Logger'); // Logger
			that.variables.add('Logger.REPORT_HINT');
			that.variables.add('Logger.REPORT_INFO');
			that.variables.add('Logger.REPORT_WARN');
			that.variables.add('Logger.REPORT_ERROR');
			flagWarning = false;

			var error = that.checkDashboard();
			if (error != undefined) {
				UI.Menu.toDashboardClicked();
				return error;
			}

			// Add any imported classes to list of variables
			let imports = Behavior.getManualCodeImport();
			imports.forEach(statement => {
				extractImportNames(statement).forEach(name => {
					console.log(`   Adding ${name} ...`);
					that.variables.add(name);
				});
			});
			console.log(`\x1b[93mInternal variables list for checking:\n  ${JSON.stringify(Array.from(that.variables))}\x1b[0m`);

			console.log(`\x1b[94mCheck statemachine ...\x1b[0m`);
			error = that.checkStatemachine();
			if (error != undefined) {
				console.log(`\x1b[91m Failed checkStateMachine for '${Behavior.getBehaviorName()}\x1b[0m'\n    ${error}`);
				UI.Menu.toStatemachineClicked();
				return error;
			}

			if (flagWarning) {
				T.logWarn(`Check warnings - but this did not invalidate the behavior!`);
				flagWarning = false;
			}
		} catch (error) {
			console.log(`\x1b[91m Failed behavior check for '${Behavior.getBehaviorName()}\x1b[0m'\n    ${error}`);
			console.log(error.stack);
			return error.error;
		}

		try {
			// this needs to work when starting a behavior
			Behavior.createStructureInfo();
		} catch (error) {
			console.log(`\x1b[91m Failed behavior createStructureInfo for '${Behavior.getBehaviorName()}\x1b[0m'\n    ${error}`);
			console.log(error.stack);
			let container_path = error.path.replace("/"+error.path.split("/").pop(), "");
			let container = Behavior.getStatemachine().getStateByPath(container_path);
			if (container instanceof BehaviorState) {
				error.error += "<br />Note: Since this error is inside a contained behavior, please open this behavior directly and fix it there.";
				error.error += "<br />Affected behavior: " + container.getBehaviorName();
				container = container.getBehaviorStatemachine();
			}
			UI.Statemachine.setDisplayedSM(container);
			UI.Menu.toStatemachineClicked();
			return error.error;
		}

		return undefined;
	}

	this.warnBehavior = function() {
		let warnings = [];

		warnings.push.apply(warnings, that.warnDashboard());
		warnings.push.apply(warnings, that.warnStatemachine());

		return warnings;
	}

	this.checkDashboard = function() {
		if (Behavior.getBehaviorName() == "") return "behavior name is not set";
		if (Behavior.getBehaviorDescription() == "") return "behavior description needs to be set";
		if (Behavior.getAuthor() == "") return "author needs to be set";

		// Python problems
		if (Behavior.getBehaviorName().match(/^[0-9]/)) return "behavior name must not start with a numeric character";

		// variables
		let illegal_element = Behavior.getPrivateVariables().findElement(function(el) {
			let valid = that.isValidPythonVarname(el.key);
			if (valid) that.variables.add(el.key);
			return !valid;

		});
		if (illegal_element != undefined) return "private variable " + illegal_element.key + " has illegal name";

		let variable_values = Behavior.getPrivateVariables().map(function(el) { return el.value; });
		for (let i = 0; i < variable_values.length; i++) {
			if (!that.isValidExpressionSyntax(variable_values[i], true)) return "private variable " + Behavior.getPrivateVariables()[i].key + " has illegal value";
		}

		// userdata
		illegal_element = Behavior.getDefaultUserdata().findElement(function(el) {
			let valid = that.isValidPythonVarname(el.key);
			if (valid) that.variables.add("_state_machine.userdata." + el.key);
			return !valid;
		});
		if (illegal_element != undefined) return "userdata key " + illegal_element.key + " has illegal name";

		let userdata_values = Behavior.getDefaultUserdata().map(function(el) { return el.value; });
		for (let i = 0; i < userdata_values.length; i++) {
			if (!that.isValidExpressionSyntax(userdata_values[i], true)) return "userdata value to key " + Behavior.getDefaultUserdata()[i].key + " is illegal";
		}

		// parameters
		let beparams = Behavior.getBehaviorParameters();
		for (let i=0; i<beparams.length; i++) {
			let p = beparams[i];
			if (p.name == "") return "a parameter has not been named";
			if (p.label == "") return "parameter " + p.name + " has no label";
			if (!['enum', 'text', 'numeric', 'boolean', 'yaml'].contains(p.type)) return "parameter " + p.name + " has illegal type: " + p.type;
			if (p.type == 'enum') {
				if (p.additional.length == 0) return "enum parameter " + p.name + " has no options to choose from";
				if (!p.additional.contains(p.default)) return "enum parameter " + p.name + " has illegal default value: " + p.default;
			}
			that.variables.add("self." + p.name);
		}

		// interface
		if (Behavior.getInterfaceOutcomes().length == 0) return "behavior needs at least one outcome";

		let iiks = Behavior.getInterfaceInputKeys();
		for (let i=0; i<iiks.length; i++) {
			let k = iiks[i];
			if (Behavior.getDefaultUserdata().findElement(function(el) {
				return el.key == k;
			}) == undefined) return "interface input key " + k + " is not contained in default userdata";
		}

		let ioks = Behavior.getInterfaceOutputKeys();
		for (let i=0; i<ioks.length; i++) {
			let k = ioks[i];
			if (Behavior.getDefaultUserdata().findElement(function(el) {
				return el.key == k;
			}) == undefined) return "interface output key " + k + " is not contained in default userdata";
		}

		// Validate import statements
		let imports = Behavior.getManualCodeImport();
		for (let i=0; i<imports.length; i++) {
			if (!that.isValidImportStatement(imports[i])) {
				return `invalid import statement '${imports[i]}' `;
			}
		}

		return undefined;
	}

	this.warnDashboard = function() {
		let warnings = [];
		if (Behavior.getCreationDate() == "") warnings.push("behavior creation date is not set");
		if (Behavior.getTags() == "") warnings.push("behavior has no tags for quicker access");

		return warnings;
	}

	this.checkStatemachine = function() {
		let sm_name = Behavior.getStatemachine().getStateName();
		if (sm_name == '') {
			sm_name = "_state_machine";
		} else {
			that.checkStateName(sm_name);
		}
		that.variables.add(sm_name);
		let error = that.checkSingleStatemachine(Behavior.getStatemachine());
		if (error != undefined) return error;

		return undefined;
	}

	this.warnStatemachine = function() {
		return that.warnSingleStatemachine(Behavior.getStatemachine());
	}


	this.checkSingleStatemachine = function(statemachine) {
		statemachine.updateDataflow(); // also required by state checking

		let states = statemachine.getStates();
		if (states.length == 0) {
			UI.Statemachine.setDisplayedSM(statemachine);
			return "state machine " + statemachine.getStatePath() + " contains no states";
		}

		if (statemachine.getInitialState() == undefined) {
			UI.Statemachine.setDisplayedSM(statemachine);
			return "state machine " + statemachine.getStatePath() + " has no initial state";
		}

		for (let i = 0; i < states.length; i++) {
			let error_string = undefined;
			if (states[i] instanceof Statemachine) {
				error_string = that.checkSingleStatemachine(states[i]);
				if (error_string != undefined) return error_string;
			}
			// always check as state because state machines are also states in their container
			error_string = that.checkSingleState(states[i]);
			// do not have to perform inner checks on embedded behaviors (-> readonly)

			if (error_string != undefined)  {
				UI.Statemachine.setDisplayedSM(statemachine);
				return error_string;
			}
		}

		return undefined
	}


	this.warnSingleStatemachine = function(statemachine) {
		let warnings = [];
		statemachine.updateDataflow(); // also required by state checking

		let states = statemachine.getStates();
		for (let i = 0; i < states.length; i++) {
			if (states[i] instanceof Statemachine) {
				warnings.push.apply(warnings, that.warnSingleStatemachine(states[i]));
			}
			warnings.push.apply(warnings, that.warnSingleState(states[i]));
		}

		// check output dataflow
		let dataflow = statemachine.getDataflow();
		for (let i = 0; i < dataflow.length; i++) {
			let d = dataflow[i];
			let available_userdata = statemachine.getInputKeys();
			if (statemachine.getStateName() == "") {
				available_userdata = available_userdata.concat(Behavior.getDefaultUserdata().map(function(el) { return el.key; }));
			}
			if ((d.getTo().getStateClass() == ":OUTCOME" || d.getTo().getStateClass() == ":CONDITION") && d.getFrom().getStateName() == "INIT" && !available_userdata.contains(d.getOutcome()))
				warnings.push("container " + statemachine.getStatePath() + " has undefined userdata for output key " + d.getOutcome() + " at outcome " + d.getTo().getStateName());
		}

		return warnings;
	}

	this.checkStateName = function(stateName) {
		    // Regular expression to match initial capitals style
			const initialCapitalsRegex = /^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
			if (!initialCapitalsRegex.test(stateName)) {
				T.logInfo(`State '${stateName}' does not follow suggested InitialCapitals style naming`);
				flagWarning = true;
			}
	}

	this.checkOutcomeLabel = function(stateName, outName) {
		// Regular expression to match initial capitals style
		if (outName == undefined) return;
		const lower = outName.toLowerCase().trim().replace(' ', '_');

		const regex_pattern = /^[a-z_][a-z0-9_]*$/;
		if (!regex_pattern.test(lower)) {
			T.logInfo(`State '${stateName}' outcome '${outName}' has unexpected characters - stick with lower case letters and digits`);
			flagWarning = true;
		}
		if (lower !== outName) {
			T.logInfo(`State '${stateName}' outcome '${outName}' does not follow suggested snake_case style naming`);
			flagWarning = true;
		}

		if (lower.startsWith('preempt')) {
			T.logError(`State '${stateName}' outcome '${outName}' uses reserved name 'preempt'`);
			flagWarning = true; // should we invalidate here?
		}
	}

	this.checkSingleState = function(state) {
		if (state.getStateName() == "") return "state at path " + state.getStatePath() + " has empty name";

		that.checkStateName(state.getStateName());
		// parameters
		if (state.getParameters().length > 0) {
			let sparams = state.getParameterValues();
			for (let i = 0; i < sparams.length; i++) {
				if (sparams[i] == "") return "parameter " + state.getParameters()[i] + " of state " + state.getStatePath() + " has empty value";
				if (state instanceof BehaviorState && sparams[i] == undefined) continue;
				if (sparams[i] === 'None') {
					continue;  // None is valid variable point
				}
				// Validate that we have defined the required variables in this state machine
				let param_type = Checking.determineType(sparams[i]);
				if (param_type != 'lambda') {
					// lambda already determines that parts are valid expressions
					if (!that.isValidExpressionSyntax(sparams[i], false)) return "parameter " + state.getParameters()[i] + " of state " + state.getStatePath() + " has invalid value";
				}
				if (param_type == 'unknown'){
					let err_text = `Unknown parameter type for ${sparams[i]} (${param_type}) of ${state.getStateName()} `;
					console.log('\x1b[91m' + err_text + '\x1b[0m');
					T.logError(err_text); // log it, but don't invalidate for now
					flagWarning = true;
					//return err_text;  // @todo - invalidate SM
				} else {
					let valid = true;
					let param_vars = Checking.extractVariables(sparams[i]);
					if (param_vars.length > 0){
						let illegal_element = param_vars.findElement(function(el) {
							let has_el = that.variables.has(el);
							if (!has_el) {
								let split_var = el.split(".");
								// Iteratively check substrings formed by removing the last segment
								// We will assume if base is valid, the use is valid for now
								for (let i = split_var.length - 1; i > 0; i--) {
									let sub_el = split_var.slice(0, i).join(".");
									if (that.variables.has(sub_el)) {
										console.log(`\x1b[92m        Found base variable ${sub_el} of ${el} - presuming valid! \x1b[0m`);
										has_el = true;
										break;
									}
								}
							}
							return !has_el;
						});
						if (illegal_element != undefined) {
							// No direct match, let's look for partial match based on class name
							let err_text = `Unknown variable for parameter <${sparams[i]}> of ${state.getStateName()} `;
							console.log('\x1b[91m' + err_text + '\x1b[0m');
							T.logError(err_text); // log it, but don't invalidate SM for now
							valid = false;
							flagWarning = true;
							//return err_text;  // @todo - invalidate SM
						}
					}
				}
			}
		}

		// input keys
		if (state.getInputKeys().length > 0) {
			let imap = state.getInputMapping();
			for (let i = 0; i < imap.length; i++) {
				if (imap[i] == "") return "input key " + state.getInputKeys()[i] + " of state " + state.getStatePath() + " has empty value";
				if (state instanceof BehaviorState && imap[i] == undefined) continue;
				if (!imap[i].match(python_varname_pattern)) return "input key " + state.getInputKeys()[i] + " of state " + state.getStatePath() + " has invalid value: " + imap[i];
			}
		}

		// output keys
		if (state.getOutputKeys().length > 0) {
			let omap = state.getOutputMapping();
			for (let i = 0; i < omap.length; i++) {
				if (omap[i] == "") return "output key " + state.getOutputKeys()[i] + " of state " + state.getStatePath() + " has empty value";
				if (!omap[i].match(python_varname_pattern)) return "output key " + state.getOutputKeys()[i] + " of state " + state.getStatePath() + " has invalid value: " + omap[i];
			}
		}

		// userdata
		let sm_dataflow = state.getContainer().getDataflow().filter(function(el) {
			return el.getTo().getStateName() == state.getStateName() && el.getFrom().getStateName() == "INIT";
		});
		for (let i = 0; i < sm_dataflow.length; i++) {
			let available_userdata = state.getContainer().getInputKeys();
			if (state.getContainer().getStateName() == "") {
				available_userdata = available_userdata.concat(Behavior.getDefaultUserdata().map(function(el) { return el.key; }));
			}
			if (!available_userdata.contains(sm_dataflow[i].getOutcome())) {
				if (!UI.Statemachine.isDataflow()) UI.Statemachine.toggleDataflow();
				return "input key " + sm_dataflow[i].getOutcome() + " of state " + state.getStatePath() + " could be undefined";
			}
		}

		// outcomes
		state.getOutcomes().forEach((oc) => {
			that.checkOutcomeLabel(state.getStateName(), oc);
		});
		if (state.getOutcomesUnconnected().length > 0) return "outcome " + state.getOutcomesUnconnected()[0] + " of state " + state.getStatePath() + " is unconnected";
		if (state.getContainer().isConcurrent()) {
			let outcome_target_list = [];
			let error_string = undefined;
			const oc_transitions = state.getContainer().getTransitions().filter(function(t) {
				return t.getFrom().getStateName() == state.getStateName()
					&& t.getTo().getStateClass() == ":CONDITION";
			});
			oc_transitions.forEach(function(t) {
				if (outcome_target_list.contains(t.getTo().getStateName())) {
					error_string = "multiple outcomes of state " + state.getStateName() + " point to the same outcome of a concurrency container";
				} else {
					outcome_target_list.push(t.getTo().getStateName());
				}
			});
			if (error_string != undefined) return error_string;
		}
	}

	this.warnSingleState = function(state) {
		let warnings = [];

		// unused output keys

		return warnings;
	}

	this.isValidExpressionSyntax = function(expr, allow_comment) {
		if (expr.length == 0) return false;

		const opening = ['(', '[', '{', '"', "'"];
		const closing = [')', ']', '}', '"', "'"];

		let close_stack = [];
		let dot_last = false;
		for (let i = 0; i < expr.length; i++) {
			let c = expr[i];
			if (dot_last && !c.match(/[A-Z,a-z_ 0-9]/i) && !closing.contains(c)) {
				T.logError("Invalid expression <"+expr+"> : either number, letter, comma, space, underscore, or closing delimiter must follow dot.\n");
				return false;
			}
			else dot_last = false;

			if (c == "," && close_stack.length == 0)
			{
				T.logError("Invalid expression <"+expr+"> : comma encountered while not in delimiters!\n");
				console.log((new Error()).stack);
				return false;
			}
			if (close_stack.length > 0 && c == close_stack[close_stack.length - 1]) {
				close_stack.pop();
				continue;
			}
			if (close_stack.length == 0 || (close_stack[close_stack.length - 1] != "'" && close_stack[close_stack.length - 1] != '"')) {
				if (opening.contains(c)) {
					close_stack.push(closing[opening.indexOf(c)]);
					continue;
				}
				if (c == "#") {
					if (allow_comment) break;
					else {
						T.logError("Invalid expression <"+expr+"> : comments using # are not allowed here.\n");
						return false;
					}
				}
				if (c == '.') {
					dot_last = true;
					continue;
				}
				if (closing.contains(c)) {
					T.logError("Invalid expression <"+expr+"> : character '" + c + " in closing without opening.\n");
					return false;
				}
			}
		}
		if (close_stack.length > 0) {
			T.logError("Invalid expression <"+expr+"> : missing final delimiter!\n");
			return false;
		}

		return true;
	}

	this.isValidPythonVarname = function(expr) {
		return expr.match(python_varname_pattern) && !python_reserved_list.contains(expr);
	}

	this.isValidReferenceName = function isValidReferenceName(item) {
		// Regular expression to match valid reference names like object.attribute
		return referenceNamePattern.test(item);
	}

	this.isValidIndexedVariable = function isValidIndexedVariable(item) {
		// Regular expression to match valid indexed variables like array[ndx] or
		// dictionary[key]
		return indexedVariablePattern.test(item);
	}

	this.isValidCompositeVariable = function(item) {
		// Regular expression to match valid composite variables like userdata.left[0]
		const outerBracketMatch = item.match(/^([^[]+)\[(.*)\]$/);
		if (outerBracketMatch) {
			let typeBefore = that.determineType(outerBracketMatch[1]); // part before first [
			let typeAfter = that.determineType(outerBracketMatch[2]);  // part between outer [ ]
			if (typeBefore == 'composite'){
				typeBefore = that.isValidCompositeVariable(outerBracketMatch[1]);
			}
			if (typeAfter == 'composite'){
				typeAfter = that.isValidCompositeVariable(outerBracketMatch[2]);
			}
			return typeBefore !== 'unknown' && typeAfter !== 'unknown'
		}
		return false;
	};

	this.isValidEquation = function(expr) {
		// Remove spaces from the equation string
		const equation = expr.trim().replace(/\s+/g, '');

		// Use the Function constructor to check for validity of simple equations
		// which allows us to avoid importing third party libraries.
		try {
			// Basic check for simple numerical or logical expressions (==, !=, <, >, <=, >=)
			// where JavaScript and Python code are the same
			new Function(`return (${equation});`);
			return true;
		} catch (e) {
			// May be valid Python that fails Javascript, try a simple conversion of some keywords
			let convert = expr.replace(' and ', ' && ')
								.replace(' or ', ' || ')
								.replace(' not ',' !')
								.replace(" math", " Math")
								.replace(/\s+/g, '');

			try {
				new Function(`return (${convert});`);
				return true;
			} catch (e) {
				// Cannot evaluate as a JavaScript equivalent expression
				console.log(`    Error:  ${e}`);
				console.log(`    We cannot confirm  | ${expr} | is valid python expression,`);
				console.log(`    nor can we confirm | ${convert} | - unknown type for now!`);
			}
		}
		return false;
	}

	this.determineType = function determineType(item) {
		// Determine type of parameter or value entered in FlexBE UI
		// Check for boolean values (true/false) with any capitalization and quoted/unquoted
		let checkItem = item.trim();
		if (checkItem.length == 0) {
			return 'unknown';
		}

		try {
			let lowerItem = checkItem.toLowerCase();
			if (lowerItem === "true" || lowerItem === "false" ||
				lowerItem === '"true"' || lowerItem === '"false"' ||
				lowerItem === "'true'" || lowerItem === "'false'") {
				return "boolean";
			}
		} catch (exc) {
			console.log(`${exc} - <${item}> - ${typeof item}`);
			console.log(exc.stack);
			flagWarning = true;
		}

		// Check for number
		const num = Number(checkItem);
		if (!isNaN(num)) {
			return checkItem.toString().includes('.') ? "float" : (Number.isInteger(num) ? "integer" : "float");
		}

		// Check for Python-style collection
		if ((checkItem.startsWith('[') && checkItem.endsWith(']')) ||
			(checkItem.startsWith('(') && checkItem.endsWith(')')) ||
			(checkItem.startsWith('{') && checkItem.endsWith('}'))) {
			return "collection";
		}

		// Check for lambda function
		if (checkItem.startsWith('lambda')){
			const lambdaRegex = /^lambda\s+([^:]+)\s*:\s*(.+)$/;
			const match = lambdaRegex.exec(checkItem);
			if (match && match.length > 2) {
				try {
					const lambdaArgs = match[1].trim();
					const lambdaEqn = match[2].trim();
					const isValidArgs = Checking.isValidExpressionSyntax('[' + lambdaArgs + ']', false); // collection of args
					if (isValidArgs) {
						if (lambdaEqn.includes('&&') || lambdaEqn.includes('||') || lambdaEqn.includes('!') ) {
							// Must use Python and, or, not keywords not C/Java form
							console.log(`\x1b[95m Invalid Python syntax for lambda '${checkItem}' - args=[${lambdaArgs}](${isValidArgs}) eqn=\{${lambdaEqn}\} (${isValidEqn})\x1b[0m`);
							T.logError('Must use Python syntax!');
							return "unknown" // if lambda plus args, then assume equation is invalid attempt
						}
						let isValidEqn = Checking.isValidExpressionSyntax(lambdaEqn, false);
						if (isValidEqn) {
							isValidEqn = Checking.isValidEquation(lambdaEqn);
							if (isValidEqn) {
								// console.log(`\x1b[95m Detected lambda expression '${checkItem}' - args=[${lambdaArgs}](${isValidArgs}) eqn=<${lambdaEqn}> (${isValidEqn})\x1b[0m`);
								return "lambda";
							} else {
								T.logWarn(`Invalid Python equation for lambda '${checkItem}' - args=[${lambdaArgs}](${isValidArgs}) eqn=\{${lambdaEqn}\} (${isValidEqn})`);
								flagWarning = true;
								return "unknown" // if lambda plus args, then assume equation is invalid attempt
							}
						} else {
							T.logWarn(`Invalid Python expression for lambda '${checkItem}' - args=[${lambdaArgs}](${isValidArgs}) eqn expression=\{${lambdaEqn}\} (${isValidEqn})`);
							flagWarning = true;
							return "unknown" // if lambda plus args, then assume equation is invalid attempt
						}
					} // else is not a lambda, so keep processing as string
				} catch (err) {
					T.logWarn(`lambda match error '${checkItem}' - '${JSON.stringify(match)}' ...`);
					console.log(err.stack);
					flagWarning = true;
				}
			}
		}

		// Check for strings and possible key-value pair (containing a colon)
		const matchingQuotesPattern = /^(['"])(.*)\1$/;
		const possibleString = matchingQuotesPattern.test(checkItem);
		const possibleKeyValueIndex = checkItem.indexOf(':');
		if (possibleString) {
			if (possibleKeyValueIndex > 0) {
				// might be 'key': 'value' or "'hello': 'world'" string
				const firstPart = checkItem.substring(0, possibleKeyValueIndex);
				const secondPart = checkItem.substring(possibleKeyValueIndex + 1);
				const firstType = that.determineType(firstPart);
				const secondType = that.determineType(secondPart);
				const validKeys = ['string', 'integer', 'float'];
				if (validKeys.includes(firstType) && secondType != 'unknown') {
					return "key-value";
				}
			}
			return "string";
		} else if (possibleKeyValueIndex > 0) {
			// might be 'key': 1 or 'key': {}, but not a string bounded by quote marks
			const firstPart = checkItem.substring(0, possibleKeyValueIndex);
			const secondPart = checkItem.substring(possibleKeyValueIndex + 1);
			const firstType = that.determineType(firstPart);
			const secondType = that.determineType(secondPart);
			const validKeys = ['string', 'integer', 'float'];
			if (validKeys.includes(firstType) && secondType != 'unknown') {
				return "key-value";
			}
		}

		// Check for valid Python variable, reference name, or indexed variable
		if (that.isValidPythonVarname(checkItem)) {
			return "variable";
		} else if (that.isValidReferenceName(checkItem)) {
			return "reference";
		} else if (that.isValidIndexedVariable(checkItem)) {
			return "indexed";
		}  else if (that.isValidCompositeVariable(checkItem)) {
			return "composite";
		} else if (that.isValidEquation(checkItem)) {
			return "equation";
		}

		// Otherwise, assume it's an unknown type
		// --  // this is expected in some checks (e.g. for format string)
		// --- console.log(`\x1b[95mUnknown type for '${item}' ('${checkItem}')!\x1b[0m`)
		return "unknown";
	}

	this.extractVariables = function extractVariables(item) {
		let variables = [];

		function recurseExtract(item) {
			let type = that.determineType(item);
			if (type === "variable") {
				variables.push(item);
			} else if (type == "key-value") {
				let elements = item.split(':').map(el => el.trim());
				elements.forEach(element => recurseExtract(element));
			} else if (type === "reference") {
				variables.push(item);
			} else if (type === "indexed") {
				let base = item.split('[')[0];
				let indices = item.match(/\[([^\]]+)\]/g).map(index => index.slice(1, -1));
				recurseExtract(base);
				indices.forEach(index => recurseExtract(index));
			} else if (type === "collection") {
				let elements = item.slice(1, -1).split(',').map(el => el.trim());
				elements.forEach(element => recurseExtract(element));
			} else if (type === "composite") {
				let parts = item.match(/^([^[]+)\[(.*)\]$/);
				recurseExtract(parts[1]); // part before [
				recurseExtract(parts[2]); // part between [ ]
			} else if (type === 'lambda') {
				console.log(`\x1b[95mSkipping variable extraction of lambda function '${item}'\x1b[0m`);
			} else if (type == 'unknown') {
				console.log(`\x1b[95mSkipping variable extraction of ${type} - '${item}'\x1b[0m`);
			}
			// strings and numbers don't interest us here
		}

		recurseExtract(item.trim());
		return variables;
	}

	this.setColorByEntryType = function setColorByEntryType(item) {

		if (!item || item.trim() == ''){
			return "initial";
		}

		const checkItem = item.trim();
		if (checkItem.trim() == ''){
			return "initial";
		}
		const type = Checking.determineType(checkItem);
		switch(type){
			// color names from https://www.w3schools.com/colors/color_tryit.asp
			case "boolean":
			case "integer":
			case "float":
				// is primitive value
				return "#FFEBCD";  // blanched almond for primitives
			case "collection":
				return "#EEE8AA";  // pale goldenrod for collections
			case "string":
				return "#7CFC00"; // lawn green for text
			case "variable":
				return "#AFEEEE"; // pale turquoise for variable
			case "reference":
				return "#B0E0E6"; // powder blue for references
			case "indexed":
			case "composite":
				return "#E0FFFF"; // light cyan indexed or composite
			case "equation":
				return "#F5DEB3"; // wheat equation
			case "lambda":
				return "#DCC7A1"; // darker shade of wheat for lambda equations
			case "key-value":
				// key value should not be valid here (only internal to collection)
				console.log(`\x1b[93mset color of '${checkItem}' to fushia for unexpected key:value pair!\x1b[0m`);
				return "#FF00FF"; // deep fushia
			case "unknown":
				console.log(`\x1b[93mset color of '${checkItem}' to orange red unknown!\x1b[0m`);
				return "#FF4500"; // orange red
			default:
				console.log(`\x1b[93mset color of '${checkItem}' to default medium violet red given unexpected type!\x1b[0m`);
				return "#C71585"; // medium violet red
		}

	}

	this.isValidImportStatement = function(statement) {
		// Remove leading and trailing whitespace and comments
		statement = statement.trim().split('#')[0].trim();

		// Regular expressions for different types of import statements
		const importBasic = /^import\s+([a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)(\s*,\s*[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)*$/;
		const importAs = /^import\s+([a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)(\s+as\s+[a-zA-Z_]\w*)(\s*,\s*[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*\s+as\s+[a-zA-Z_]\w*)*$/;
		const fromImport = /^from\s+([a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)\s+import\s+([a-zA-Z_]\w*|\*)(\s*,\s*[a-zA-Z_]\w*|\*)*$/;
		const fromImportAs = /^from\s+([a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)\s+import\s+([a-zA-Z_]\w*\s+as\s+[a-zA-Z_]\w*)(\s*,\s*[a-zA-Z_]\w*\s+as\s+[a-zA-Z_]\w*)*$/;

		return importBasic.test(statement) ||
			importAs.test(statement) ||
			fromImport.test(statement) ||
			fromImportAs.test(statement);
	}

	function extractImportNames(statement) {
		// Remove leading and trailing whitespace and comments
		statement = statement.trim().split('#')[0].trim();

		// Arrays to hold the extracted names
		let names = [];

		// Regular expressions for different types of import statements
		const importBasic = /^import\s+(.+)$/;
		const fromImport = /^from\s+([a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*)\s+import\s+(.+)$/;

		let match;

		if ((match = importBasic.exec(statement)) !== null) {
			// Handle "import A, B" and "import A as C"
			match[1].split(',').forEach(part => {
				const name = part.trim().split(/\s+as\s+/);
				names.push(name[1] || name[0]);
			});
		} else if ((match = fromImport.exec(statement)) !== null) {
			// Handle "from A import B" and "from A import B as C"
			match[3].split(',').forEach(part => {
				const name = part.trim().split(/\s+as\s+/);
				names.push(name[1] || name[0]);
			});
		}

		return names;
	}

}) ();