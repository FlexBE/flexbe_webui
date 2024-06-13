DumpWorkspace = new (function() {

	this.collectAllStates = function(callback) {
		var state_types = WS.Statelib.getTypeList();
		var state_collection = [];

		var next = function(){
			if (state_types.length == 0){
				IO.Filesystem.createFile("/tmp", "flexbe_states.json", JSON.stringify(state_collection), callback);
			} else {
				var state_type = state_types.shift();
				var state = WS.Statelib.getFromLib(state_type);
				state_collection.push({
					state_class: state.getStateClass(),
					state_desc: state.getStateDesc(),
					short_desc: state.getShortDesc(),
					state_path: state.getStatePath(),
					state_package: state.getStatePackage(),
					parameters: state.getParameters(),
					outcomes: state.getOutcomes(),
					input_keys: state.getInputKeys(),
					output_keys: state.getOutputKeys(),
					default_parameter_values: state.getDefaultParameterValues(),
					default_autonomy: state.getDefaultAutonomy(),
					parameter_desc: state.getParamDesc(),
					input_desc: state.getInputDesc(),
					output_desc: state.getOutputDesc(),
					outcome_desc: state.getOutcomeDesc(),
					class_variables: state.getClassVariables(),
					file_path: state.getFilePath(),
				});
				next();
			}
		}
		next();
	}

})();
