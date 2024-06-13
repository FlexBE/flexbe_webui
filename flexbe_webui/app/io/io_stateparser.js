IO.StateParser = new (function() {
	var that = this;

	this.parseState = function(state_data) {
		if (typeof state_data.state_outcomes == "string") {
			state_data.state_outcomes = ['$' + state_data.state_outcomes];
			state_data.state_autonomy = [];
		}
		if (typeof state_data.state_input == "string")
			state_data.state_input = ['$' + state_data.state_input];
		if (typeof state_data.state_output == "string")
			state_data.state_output = ['$' + state_data.state_output];
		var state_def = new WS.StateDefinition(
			state_data.state_class,
			parseDocumentation(state_data.state_docstring),
			state_data.import_path,
			state_data.state_params,
			state_data.state_outcomes,
			state_data.state_input,
			state_data.state_output,
			state_data.state_params_values,
			state_data.state_autonomy,
			state_data.class_vars,
		)

		const components = state_data.file_path.split('/');
		const file_name = components.pop();
		const parent_folder = components.length > 0 ? components.pop() : '';
		const new_path = parent_folder + '/' + file_name;
		console.log("  parsed state " + new_path);

		state_def.setFilePath(state_data.file_path);
		return state_def
	}

	var parseDocumentation = function(docstring) {
		if (typeof docstring != "string" || docstring == "")
			return new WS.Documentation("[no documentation]");
		var state_desc = "";
		var argument_doc = [];
		var last_argument = undefined;
		var line_split = docstring.trim().replace(/[\n\r]+/g, "\n\r").split(/[\n\r]+/g);
		for (var i = 0; i < line_split.length; i++) {
			var l = line_split[i].trim();
			if (l.match(/^(--|>#|#>)/)) {
				if (last_argument != undefined) argument_doc.push(last_argument);
				var arg_split = l.match(/^(--|>#|#>)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/);
				if (arg_split == null || arg_split.length < 5) {
					console.log("\x1b[96m-----------------------------\x1b[0m");
					console.log(JSON.stringify(line_split));
					T.logWarn("Entry does not fit documentation format: '" + l + "'");
				} else {
					last_argument = {
						symbol: arg_split[1],
						name: arg_split[2],
						type: arg_split[3],
						desc: arg_split[4]
					};
				}
			} else if (l.startsWith("<=")) {
				if (last_argument != undefined) argument_doc.push(last_argument);
				var arg_split = l.match(/^(<=)\s+([^\s]+)\s+(.+)$/);
				if (arg_split == null || arg_split.length < 4) {
					console.log("\x1b[96m-----------------------------\x1b[0m");
					console.log(JSON.stringify(line_split));
					T.logWarn("Entry does not fit documentation format: '" + l + "'");
				} else {
					last_argument = {
						symbol: arg_split[1],
						name: arg_split[2],
						type: "",
						desc: arg_split[3]
					};
				}
			} else if (last_argument != undefined) {
				last_argument['desc'] += " " + l;
			} else {
				if (state_desc != "") state_desc += " ";
				state_desc += l;
			}
		}
		if (last_argument != undefined) argument_doc.push(last_argument);

		if (state_desc.match(/^\s*$/)) {
			state_desc = "[no documentation]";
		}
		var state_doc = new WS.Documentation(state_desc);
		for (var i = 0; i < argument_doc.length; i++) {
			var a = argument_doc[i];
			state_doc.addDescription(a['symbol'], a['name'], a['type'], a['desc']);
		}
		return state_doc;
	}

}) ();