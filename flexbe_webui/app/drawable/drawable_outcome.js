Drawable.Outcome = function(outcome_obj, target_paper, readonly, outline) {
	//var that = this;

	var paper = target_paper;
	var font_size = Drawable.Helper.scaled(10, 8);
	var box_width = Drawable.Helper.scaled(35, 28);
	var box_height = Drawable.Helper.scaled(20, 16);
	var symbol_x = Drawable.Helper.scaled(8, 6);
	var symbol_y = Drawable.Helper.scaled(8, 6);
	var symbol_radius = Drawable.Helper.scaled(5, 4);
	var label_y = Drawable.Helper.scaled(25, 20);
	var drag_size = Drawable.Helper.scaled(15, 12);
	var node_stroke_width = Drawable.Helper.getNodeStrokeWidth(false);
	var outer_radius = Math.max(
		Drawable.Helper.scaled(8, 6),
		symbol_radius + Drawable.Helper.scaled(3, 2) + node_stroke_width
	);

	var color = outline? '#999' : '#000';

	var dot = paper.set();
	var dot_box = paper.rect(0, 0, box_width, box_height).attr({opacity: 0});
	if (outcome_obj.getContainer().isConcurrent()) {
		dot.push(paper.text(symbol_x, symbol_y, '&').attr({fill: color, 'font-size': font_size}));
	} else {
		dot.push(paper.circle(symbol_x, symbol_y, symbol_radius).attr({fill: color, stroke: color, 'stroke-width': node_stroke_width}));
	}
	var outer_dot = paper.circle(symbol_x, symbol_y, outer_radius).attr({'fill-opacity': 0, fill: '#FFF', stroke: color, 'stroke-width': node_stroke_width});
	if (!readonly) outer_dot
		.data("state", outcome_obj)
		.click(Drawable.Helper.connectTransition);

	if(!readonly && UI.Statemachine.isConnecting()) outer_dot.attr({'cursor': 'pointer'});

	dot.push(dot_box);
	dot.push(outer_dot);
	dot.push(paper.text(symbol_x, label_y, outcome_obj.getStateName().split('#')[0]).attr({fill: color, 'font-size': font_size}));

	if (!readonly) {
		var drag_box = paper.image('img/move-icon.png', box_width - drag_size, 0, drag_size, drag_size)
			.attr({cursor: 'move', 'stroke-width': 1})
			.data("state", outcome_obj)
			.data("box", dot_box)
			.drag(Drawable.Helper.moveFnc, Drawable.Helper.startFnc, Drawable.Helper.endFnc);
		dot.push(drag_box);
	}

	dot.translate(outcome_obj.getPosition().x, outcome_obj.getPosition().y);

	this.drawing = dot;
	this.obj = outcome_obj;

	if (!readonly)
		Drawable.Helper.initialIntersectCheck(dot, outcome_obj);
};
