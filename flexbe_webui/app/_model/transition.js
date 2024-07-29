const Transition = function(_from_state, _to_state, _outcome, _autonomy,
							_x=undefined, _y=undefined,
							beg_x=undefined, beg_y=undefined,
							end_x=undefined, end_y=undefined) {

	var from = _from_state;
	var to = _to_state;
	var outcome = _outcome;
	var autonomy = _autonomy;
	var x = _x;
	var y = _y;
	var beginning;
	var end;

	if(x == -1){
		x = undefined;
		y = undefined;
	}

	if(beg_x != -1 && beg_x !== undefined){
		beginning = {x: beg_x, y: beg_y};
	}

	if(end_x != -1 && end_x !== undefined){
		console.log(`\x1b[95m - end_x, end_y defined fixed\x1b[0m`);
		end = {x: end_x, y: end_y};
	}

	this.getFrom = function() {
		return from;
	}
	this.setFrom = function(_from) {
		from = _from;
	}

	this.getTo = function() {
		return to;
	}
	this.setTo = function(_to) {
		to = _to;
	}

	this.getOutcome = function() {
		return outcome;
	}
	this.setOutcome = function(_outcome) {
		outcome = _outcome;
	}

	this.getAutonomy = function() {
		return autonomy;
	}
	this.setAutonomy = function(_autonomy) {
		autonomy = _autonomy;
	}

	this.getX = function() {
		return x;
	}

	this.setX = function(_x) {
		x = _x;
	}

	this.getY = function() {
		return y;
	}

	this.setY = function(_y) {
		y = _y;
	}

	this.getBeginning = function() {
		return beginning;
	}

	this.setBeginning = function(beg) {
		beginning = beg; //beginning is formatted {x: , y: }
	}

	this.getEnd = function() {
		return end;
	}

	this.setEnd = function(_end) {
		end = _end; //end is formatted {x: , y: }
	}

	this.toJSON = function(){
		var temp_beg_x = undefined;
		var temp_beg_y = undefined;
		var temp_end_x = undefined;
		var temp_end_y = undefined;
		if (beginning !== undefined){
			temp_beg_x = beginning.x;
			temp_beg_y = beginning.y;
		}
		if (end !== undefined){
			temp_end_x = end.x;
			temp_end_y = end.y;
		}

		return {
			from_state_name: from.getStateName(),
			to_state_name: to.getStateName(),
			to_state_class: to.getStateClass(),
			outcome: outcome,
			autonomy: autonomy,
			x: x,
			y: y,
			beg_x: temp_beg_x,
			beg_y: temp_beg_y,
			end_x: temp_end_x,
			end_y: temp_end_y
		}
	}

	/* Deprecated */
	this.getDrawnFromState = function() {
		return UI.Statemachine.getDrawnState(this.from);
	}

	/* Deprecated */
	this.getDrawnToState = function() {
		if (this.to)
			return UI.Statemachine.getDrawnState(this.to);
		else
			return UI.Statemachine.mouse_pos;
	}

};
