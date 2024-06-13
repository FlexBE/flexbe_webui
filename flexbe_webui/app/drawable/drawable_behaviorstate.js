Drawable.BehaviorState = function(_state_obj, target_paper, readonly, mode, active, locked) {
	//var that = this;

	var paper = target_paper;
	var width = 0;
	var height = 60;
	var state = paper.set();
	var state_obj = _state_obj;


	// Title
	//-------

	const state_name = paper.text(8, 13, state_obj.getStateName())
		.attr({"text-anchor": 'start', "font-weight": 'bold'});
	if (!readonly) state_name
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);
	width = Math.max(width, state_name.getBBox().width);

	const state_be_name = paper.text(8, 28, state_obj.getBehaviorName())
		.attr({"text-anchor": 'start', fill: '#555'});
	if (!readonly) state_be_name
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);
	width = Math.max(width, state_be_name.getBBox().width);

	const state_pkg = paper.text(8, 41, state_obj.getStatePackage())
		.attr({"text-anchor": 'start', fill: '#555'});
	if (!readonly) state_pkg
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);
	width = Math.max(width, state_pkg.getBBox().width);

	state.push(state_name);
	state.push(state_be_name);
	state.push(state_pkg);


	// Outcomes
	//----------

	if (mode == Drawable.State.Mode.OUTCOME) {

		for (let i = 0; i < state_obj.getOutcomesUnconnected().length; ++i) {
			if (state_obj.getOutcomesUnconnected()[i].charAt(0) == "$") continue;
			const state_oc = paper.text(8, height, state_obj.getOutcomesUnconnected()[i])
				.attr({"text-anchor": 'start', fill: '#005', cursor: 'pointer'})
				.data("state", state_obj)
				.data("label", state_obj.getOutcomesUnconnected()[i])
				.click(Drawable.Helper.beginTransition);
			state.push(state_oc);
			height += 15;
			width = Math.max(width, state_oc.getBBox().width);
		}

	}


	// Mapping
	//---------

	if (mode == Drawable.State.Mode.MAPPING) {

		const input_keys = state_obj.getInputKeys();
		const input_mapping = state_obj.getInputMapping();
		const output_keys = state_obj.getOutputKeys();
		const output_mapping = state_obj.getOutputMapping();

		const state_im_header = paper.text(5, height, "Input Data:")
			.attr({"text-anchor": 'start'});
		state.push(state_im_header);
		height += 15;
		for (let i = 0; i < input_mapping.length; ++i) {
			const key = input_keys[i];
			const mapping = input_mapping[i];
			const state_im = paper.text(5, height, mapping + " (" + key + ")")
				.attr({"text-anchor": 'start', fill: '#050'});
			state.push(state_im);
			height += 15;
			width = Math.max(width, state_im.getBBox().width);
		}
		if (input_mapping.length == 0) {
			const state_im = paper.text(5, height, "no input keys")
				.attr({"text-anchor": 'start', fill: '#555', 'font-style': 'italic'});
			state.push(state_im);
			height += 15;
			width = Math.max(width, state_im.getBBox().width);
		}

		height += 5;

		const state_om_header = paper.text(5, height, "Output Data:")
			.attr({"text-anchor": 'start'});
		state.push(state_om_header);
		height += 15;
		for (let i = 0; i < output_mapping.length; ++i) {
			const key = output_keys[i];
			const mapping = output_mapping[i];
			const state_om = paper.text(5, height, mapping + " (" + key + ")")
				.attr({"text-anchor": 'start', fill: '#500'});
			state.push(state_om);
			height += 15;
			width = Math.max(width, state_om.getBBox().width);
		}
		if (output_mapping.length == 0) {
			const state_om = paper.text(5, height, "no output keys")
				.attr({"text-anchor": 'start', fill: '#555', 'font-style': 'italic'});
			state.push(state_om);
			height += 15;
			width = Math.max(width, state_om.getBBox().width);
		}

	}


	// Background
	//------------

	width += 50;
	height -= 2;
	const state_outer_box = paper.rect(0, 0, width, height).toBack();
	if (!readonly) state_outer_box
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);

	const state_box = paper.rect(3, 3, width-6, height-6).toBack();
	if (locked) state_box
		.attr({fill: '120-#eb6:0-#fd9:80', 'stroke-width': 2});
	else if (active) state_box
		.attr({fill: '120-#cde:0-#def:80', 'stroke-width': 2});
	else state_box
		.attr({fill: '120-#fde:0-#fef:80'});
	if (!readonly) state_box
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);

	if (!readonly) {
		const drag_box = paper.image('img/move-icon.png', width-19, 4, 15, 15)
			.attr({cursor: 'move', 'stroke-width': 1})
			.data("state", state_obj)
			.data("box", state_outer_box)
			.drag(Drawable.Helper.moveFnc, Drawable.Helper.startFnc, Drawable.Helper.endFnc);
		state.push(drag_box);
	}

	state.push(state_box);
	state.push(state_outer_box);
	state.translate(state_obj.getPosition().x, state_obj.getPosition().y);

	this.drawing = state;
	this.obj = state_obj;

	if (!readonly)
		Drawable.Helper.initialIntersectCheck(state, state_obj);
};