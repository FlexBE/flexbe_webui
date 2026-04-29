Drawable.BehaviorState = function(_state_obj, target_paper, readonly, mode, active, locked) {
	//var that = this;

	var paper = target_paper;
	var width = 0;
	var line_height = Drawable.Helper.scaled(15, 12);
	var font_size = Drawable.Helper.scaled(10, 8);
	var font_weight = Drawable.Helper.getTextWeight();
	var text_x = Drawable.Helper.scaled(8, 5);
	var detail_x = Drawable.Helper.scaled(5, 4);
	var title_y_1 = Drawable.Helper.scaled(13, 11);
	var title_y_2 = title_y_1 + line_height;
	var title_y_3 = title_y_2 + line_height;
	var width_padding = Drawable.Helper.scaled(50, 32);
	var height_trim = Drawable.Helper.scaled(2, 1);
	var drag_size = Drawable.Helper.scaled(15, 12);
	var drag_offset = Drawable.Helper.scaled(4, 2);
	var border_inset = Drawable.Helper.scaled(3, 2);
	var height = title_y_3 + line_height + Drawable.Helper.scaled(4, 3);
	var state = paper.set();
	var state_obj = _state_obj;
	var node_stroke_width = Drawable.Helper.getNodeStrokeWidth(false);
	var node_stroke_width_highlight = Drawable.Helper.getNodeStrokeWidth(true);


	// Title
	//-------

	const state_name = paper.text(text_x, title_y_1, state_obj.getStateName())
		.attr({"text-anchor": 'start', "font-weight": font_weight, "font-size": font_size});
	if (!readonly) state_name
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);
	width = Math.max(width, state_name.getBBox().width);

	const state_be_name = paper.text(text_x, title_y_2, state_obj.getBehaviorName())
		.attr({"text-anchor": 'start', fill: '#555', "font-size": font_size});
	if (!readonly) state_be_name
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);
	width = Math.max(width, state_be_name.getBBox().width);

	const state_pkg = paper.text(text_x, title_y_3, state_obj.getStatePackage())
		.attr({"text-anchor": 'start', fill: '#555', "font-size": font_size});
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
			const state_oc = paper.text(text_x, height, state_obj.getOutcomesUnconnected()[i])
				.attr({"text-anchor": 'start', fill: '#005', cursor: 'pointer', "font-size": font_size})
				.data("state", state_obj)
				.data("label", state_obj.getOutcomesUnconnected()[i])
				.click(Drawable.Helper.beginTransition);
			state.push(state_oc);
			height += line_height;
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

		const state_im_header = paper.text(detail_x, height, "Input Data:")
			.attr({"text-anchor": 'start', "font-size": font_size});
		state.push(state_im_header);
		height += line_height;
		for (let i = 0; i < input_mapping.length; ++i) {
			const key = input_keys[i];
			const mapping = input_mapping[i];
			const state_im = paper.text(detail_x, height, mapping + " (" + key + ")")
				.attr({"text-anchor": 'start', fill: '#050', "font-size": font_size});
			state.push(state_im);
			height += line_height;
			width = Math.max(width, state_im.getBBox().width);
		}
		if (input_mapping.length == 0) {
			const state_im = paper.text(detail_x, height, "no input keys")
				.attr({"text-anchor": 'start', fill: '#555', 'font-style': 'italic', "font-size": font_size});
			state.push(state_im);
			height += line_height;
			width = Math.max(width, state_im.getBBox().width);
		}

		height += Drawable.Helper.scaled(5, 3);

		const state_om_header = paper.text(detail_x, height, "Output Data:")
			.attr({"text-anchor": 'start', "font-size": font_size});
		state.push(state_om_header);
		height += line_height;
		for (let i = 0; i < output_mapping.length; ++i) {
			const key = output_keys[i];
			const mapping = output_mapping[i];
			const state_om = paper.text(detail_x, height, mapping + " (" + key + ")")
				.attr({"text-anchor": 'start', fill: '#500', "font-size": font_size});
			state.push(state_om);
			height += line_height;
			width = Math.max(width, state_om.getBBox().width);
		}
		if (output_mapping.length == 0) {
			const state_om = paper.text(detail_x, height, "no output keys")
				.attr({"text-anchor": 'start', fill: '#555', 'font-style': 'italic', "font-size": font_size});
			state.push(state_om);
			height += line_height;
			width = Math.max(width, state_om.getBBox().width);
		}

	}


	// Background
	//------------

	width += width_padding;
	height -= height_trim;
	const state_outer_box = paper.rect(0, 0, width, height).toBack();
	state_outer_box.attr({'stroke-width': node_stroke_width});
	if (!readonly) state_outer_box
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);

	const state_box = paper.rect(border_inset, border_inset, width - border_inset * 2, height - border_inset * 2).toBack();
	if (locked) state_box
		.attr({fill: '120-#eb6:0-#fd9:80', 'stroke-width': node_stroke_width_highlight});
	else if (active) state_box
		.attr({fill: '120-#cde:0-#def:80', 'stroke-width': node_stroke_width_highlight});
	else state_box
		.attr({fill: '120-#fde:0-#fef:80', 'stroke-width': node_stroke_width});
	if (!readonly) state_box
		.attr({'cursor': 'pointer'})
		.data("state", state_obj)
		.click(Drawable.Helper.viewStateProperties)
		.dblclick(Drawable.Helper.enterBehavior);

	if (!readonly) {
		const drag_box = paper.image('img/move-icon.png', width - drag_size - drag_offset, drag_offset, drag_size, drag_size)
			.attr({cursor: 'move', 'stroke-width': 1})
			.data("state", state_obj)
			.data("box", state_outer_box)
			.drag(Drawable.Helper.moveFnc, Drawable.Helper.startFnc, Drawable.Helper.endFnc);
		state.push(drag_box);
	}

	state.push(state_box);
	state.push(state_outer_box);
	state.translate(state_obj.getPosition().x, state_obj.getPosition().y);
	state.cached_bbox = {width: width, height: height};

	this.drawing = state;
	this.obj = state_obj;

	if (!readonly)
		Drawable.Helper.initialIntersectCheck(state, state_obj);
};
