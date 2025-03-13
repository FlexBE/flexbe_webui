Drawable.Transition = function(transition_obj, target_paper, readonly, drawings, highlight, outline, path_type, color, runtime_view=false) {
	var that = this;

	var paper = target_paper;
	var transition_colors = ['#998', '#99f', '#9d9', '#faa'];
	var transition_text_colors = ['#554', '#559', '#585', '#966'];
	var transition_highlight_color = '#FC5'

	var resetTransition = function() {
		if (RC.Controller.isReadonly()) return;

		UI.Statemachine.resetTransition(transition_obj);
	}

	var text_color = color;
	if (outline) {
		color = '#EEE';
	} else if (color == undefined) {
		color = highlight? transition_highlight_color : transition_colors[Math.max(0, transition_obj.getAutonomy())];
		text_color = transition_text_colors[Math.max(0, transition_obj.getAutonomy())];
		if (transition_obj.getFrom().getStateName() == "INIT") {
			color = '#000';
		}
	}

	const from = drawings.findElement(function(element) {
		return element.obj instanceof State && element.obj.getStateName() == transition_obj.getFrom().getStateName();
	}).drawing;
	const to = transition_obj.getTo()? drawings.findElement(function(element) {
		return element.obj instanceof State && element.obj.getStateName() == transition_obj.getTo().getStateName();
	}).drawing : UI.Statemachine.getMousePos();
	line = undefined;

	var bb1 = from.getBBox(),
		bb2 = to.getBBox();

	var cornersFrom = [{x: bb1.x - 1, y: bb1.y - 1}, //top left
	{x: bb1.x - 1, y: bb1.y + bb1.height + 1}, //bottom left
	{x: bb1.x + bb1.width + 1, y: bb1.y + bb1.height + 1}, //bottom right
	{x: bb1.x + bb1.width + 1, y: bb1.y - 1}]; //top right

	var cornersTo = [{x: bb2.x - 1, y: bb2.y - 1}, //top left
	{x: bb2.x - 1, y: bb2.y + bb2.height + 1}, //bottom left
	{x: bb2.x + bb2.width + 1, y: bb2.y + bb2.height + 1}, //bottom right
	{x: bb2.x + bb2.width + 1, y: bb2.y - 1}]; //top right

	var moveEndPoints = function() {
		if(!clicked){
			that.drawing[2][0].toFront();
			that.drawing[2][0].attr({opacity: 100, cursor: 'move', 'stroke-width': 1});
			that.drawing[2][0].data("point", begin);
			that.drawing[2][0].data("corners", cornersFrom);

			var old_x_beg = that.drawing[2][0].data("point").attr("cx");
			var old_y_beg = that.drawing[2][0].data("point").attr("cy");
			var new_x;
			var new_y;
			that.drawing[2][0].drag(Drawable.Helper.moveFncEndPoint, Drawable.Helper.startFncEndPoint, function(evt){
				new_x = Math.floor(that.drawing[2][0].attr("cx"));
				new_y = Math.floor(that.drawing[2][0].attr("cy"));
				ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
					"Moved "+transition_obj.getOutcome()+" beginning",
					function() {
						transition_obj.setBeginning({x: old_x_beg, y: old_y_beg});
						UI.Statemachine.updateMergedTransitions(transition_obj);
						UI.Statemachine.refreshView();
					},
					function() {
						transition_obj.setBeginning({x: new_x, y: new_y});
						UI.Statemachine.updateMergedTransitions(transition_obj);
						UI.Statemachine.refreshView();
					}
				);
				transition_obj.setBeginning({
					x: new_x,
					y: new_y
				});
				UI.Statemachine.updateMergedTransitions(transition_obj);
				UI.Statemachine.refreshView();
			});

			that.drawing[2][1].toFront();
			that.drawing[2][1].attr({opacity: 100, cursor: 'move', 'stroke-width': 1});
			that.drawing[2][1].data("point", that.drawing[2][1]);
			that.drawing[2][1].data("corners", cornersTo);
			var old_x_end = that.drawing[2][1].data("point").attr("cx");
			var old_y_end = that.drawing[2][1].data("point").attr("cy");
			that.drawing[2][1].drag(Drawable.Helper.moveFncEndPoint, Drawable.Helper.startFncEndPoint, function(evt){
				new_x = Math.floor(that.drawing[2][1].attr("cx"));
				new_y = Math.floor(that.drawing[2][1].attr("cy"));
				ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
					"Moved "+transition_obj.getOutcome()+" end", function() {
						transition_obj.setEnd({x: old_x_end, y: old_y_end});
						UI.Statemachine.updateMergedTransitions(transition_obj);
						UI.Statemachine.refreshView();
					},
					function() {
						transition_obj.setEnd({x: new_x, y: new_y});
						UI.Statemachine.updateMergedTransitions(transition_obj);
						UI.Statemachine.refreshView();
					}
				);
				transition_obj.setEnd({
					x: new_x,
					y: new_y
				});
				UI.Statemachine.updateMergedTransitions(transition_obj);
				UI.Statemachine.refreshView();
			});

			clicked = true;
		}else{
			that.drawing[2][0].attr({opacity: 0}).unclick();
			that.drawing[2][1].attr({opacity: 0}).unclick();
			clicked = false
			resetTransition();
		}
	}

	var	p = [{x: bb1.x + bb1.width / 2, y: bb1.y - 1},
		{x: bb1.x + bb1.width / 2, y: bb1.y + bb1.height + 1},
		{x: bb1.x - 1, y: bb1.y + bb1.height / 2},
		{x: bb1.x + bb1.width + 1, y: bb1.y + bb1.height / 2},
		{x: bb2.x + bb2.width / 2, y: bb2.y - 1},
		{x: bb2.x + bb2.width / 2, y: bb2.y + bb2.height + 1},
		{x: bb2.x - 1, y: bb2.y + bb2.height / 2},
		{x: bb2.x + bb2.width + 1, y: bb2.y + bb2.height / 2}],
		d = {}, dis = [];

	var x1, y1, x2, y2;
	var res;
	if (runtime_view) {
		// Runtime view uses simple transition arcs
		for (let i = 0; i < 4; i++) {
			for (let j = 4; j < 8; j++) {
				var dx, dy;
				dx = Math.abs(p[i].x - p[j].x),
				dy = Math.abs(p[i].y - p[j].y);
				dis.push(dx + dy);
				d[dis[dis.length - 1]] = [i, j];
			}
		}
		if (dis.length == 0) {
			res = [0, 4];
		} else {
			res = d[Math.min.apply(Math, dis)];
		}
		x1 = p[res[0]].x;
		y1 = p[res[0]].y;
		x2 = p[res[1]].x;
		y2 = p[res[1]].y;
	} else {
		// Editor view can have custom transition curves
		if(transition_obj.getBeginning() != undefined && transition_obj.getEnd() != undefined){
			// both beginning and end are specifically defined
			x1 = transition_obj.getBeginning().x;
			y1 = transition_obj.getBeginning().y;
			x2 = transition_obj.getEnd().x;
			y2 = transition_obj.getEnd().y;
			let i = 1;
			let j = 5;
			if(x1 == bb1.x - 1) i = 2;
			else if(x1 == bb1.x + bb1.width + 1) i = 3;
			else if (y1 == bb1.y - 1) i = 0;
			else i = 1;

			if(x2 == bb2.x - 1) j = 6;
			else if(x2 == bb2.x + bb2.width + 1) j = 7;
			else if (y2 == bb2.y - 1) j = 4;
			else j = 5;

			res = [i, j];

		}
		else if (transition_obj.getBeginning() != undefined){
			// beginning is defined, but not end
			x1 = transition_obj.getBeginning().x;
			y1 = transition_obj.getBeginning().y;
			let i = 1;

			if(x1 == bb1.x - 1) i = 2;
			else if(x1 == bb1.x + bb1.width + 1) i = 3;
			else if (y1 == bb1.y - 1) i = 0;
			else i = 1;

			for (let j = 4; j < 8; j++) {
				let dx, dy;
				if (transition_obj == UI.Statemachine.getDisplayedSM().getInitialTransition() ||
					transition_obj.getX() == undefined || transition_obj.getY() == undefined){
					dx = Math.abs(x1 - p[j].x),
					dy = Math.abs(y1 - p[j].y);
				}else {
					dx = Math.abs(x1 - transition_obj.getX()) + Math.abs(p[j].x - transition_obj.getX()),
					dy = Math.abs(y1 - transition_obj.getY()) + Math.abs(p[j].y - transition_obj.getY());
				}
				dis.push(dx + dy);
				d[dis[dis.length - 1]] = [i, j];
			}

			if (dis.length == 0) {
				res = [0, 4];
			} else {
				res = d[Math.min.apply(Math, dis)];
			}

			x2 = p[res[1]].x;
			y2 = p[res[1]].y;

		}
		else if (transition_obj.getEnd() != undefined){
			// end is defined, but not the beginning
			x2 = transition_obj.getEnd().x;
			y2 = transition_obj.getEnd().y;

			let j = 5;

			if(x2 == bb2.x - 1) j = 6;
			else if(x2 == bb2.x + bb2.width + 1) j = 7;
			else if (y2 == bb2.y - 1) j = 4;
			else j = 5;

			for (let i = 0; i < 4; i++) {

				let dx, dy;
				if (transition_obj == UI.Statemachine.getDisplayedSM().getInitialTransition() || transition_obj.getX() == undefined || transition_obj.getY() == undefined){
					dx = Math.abs(p[i].x - x2),
					dy = Math.abs(p[i].y - y2);
				}else {
					dx = Math.abs(p[i].x - transition_obj.getX()) + Math.abs(x2 - transition_obj.getX()),
					dy = Math.abs(p[i].y - transition_obj.getY()) + Math.abs(y2 - transition_obj.getY());
				}
				dis.push(dx + dy);
				d[dis[dis.length - 1]] = [i, j];
			}
			if (dis.length == 0) {
				res = [0, 4];
			} else {
				res = d[Math.min.apply(Math, dis)];
			}
			x1 = p[res[0]].x;
			y1 = p[res[0]].y;

		}else {
			// neither beginning or end of transition is defined - use default placement
			for (let i = 0; i < 4; i++) {
				for (let j = 4; j < 8; j++) {
					let dx, dy;
					if (transition_obj == UI.Statemachine.getDisplayedSM().getInitialTransition() || transition_obj.getX() == undefined || transition_obj.getY() == undefined){
						dx = Math.abs(p[i].x - p[j].x),
						dy = Math.abs(p[i].y - p[j].y);
					}else {
						dx = Math.abs(p[i].x - transition_obj.getX()) + Math.abs(p[j].x - transition_obj.getX()),
						dy = Math.abs(p[i].y - transition_obj.getY()) + Math.abs(p[j].y - transition_obj.getY());
					}
					dis.push(dx + dy);
					d[dis[dis.length - 1]] = [i, j];
				}
			}
			if (dis.length == 0) {
				res = [0, 4];
			} else {
				res = d[Math.min.apply(Math, dis)];
			}
			x1 = p[res[0]].x;
			y1 = p[res[0]].y;
			x2 = p[res[1]].x;
			y2 = p[res[1]].y;

		}
	}
	if (to == from) x1 += 30;
	dx = Math.max(Math.abs(x1 - x2) / 2, 10);
	dy = Math.max(Math.abs(y1 - y2) / 2, 10);

	var keep_ends = UI.Settings.isTransitionModeCentered()
		|| UI.Settings.isTransitionModeCombined() && (Math.abs(x1 - x2) < 2 || Math.abs(y1 - y2) < 2);


	if (!keep_ends) {
		if (transition_obj.getFrom().getStateName() != "INIT" && transition_obj.getBeginning() == undefined) {
			if (res[0] <= 1) { // vertical
				x1 += (bb1.width / 2) / paper.width * (p[res[1]].x - paper.width / 2);
			} else {
				y1 += (bb1.height / 2) / paper.height * (p[res[1]].y - paper.height / 2);
			}
		}
		if(transition_obj.getEnd() == undefined){
			if (res[1] <= 5) { // vertical
				x2 += (bb2.width / 2) / paper.width * (p[res[0]].x - paper.width / 2);
			} else {
				y2 += (bb2.height / 2) / paper.height * (p[res[0]].y - paper.height / 2);
			}
		}
	}

	x3 = transition_obj.getX();
	y3 = transition_obj.getY();

	let path;
	if (runtime_view ||
		transition_obj == UI.Statemachine.getDisplayedSM().getInitialTransition() ||
		transition_obj.getX() == undefined ||
		transition_obj.getY() == undefined){
		if (!(runtime_view || transition_obj == UI.Statemachine.getDisplayedSM().getInitialTransition()) &&
			(transition_obj.getX() != undefined || transition_obj.getY() != undefined)){
				console.log("\x1b[31m HOW IS THIS POSSIBLE! Both should be set or unset (" + transition_obj.getX() + ", " + transition_obj.getY() + ")!\x1b[0m");
		}
		var x4 = [x1, x1, x1 - dx, x1 + dx][res[0]].toFixed(3),
		y4 = [y1 - dy, y1 + dy, y1, y1][res[0]].toFixed(3),
		x3 = [0, 0, 0, 0, x2, x2, x2 - dx, x2 + dx][res[1]].toFixed(3),
		y3 = [0, 0, 0, 0, y1 + dy, y1 - dy, y2, y2][res[1]].toFixed(3);
		if (path_type == Drawable.Transition.PATH_CURVE) {
			path = ["M", x1.toFixed(3), y1.toFixed(3), "C", x4, y4, x3, y3, x2.toFixed(3), y2.toFixed(3)].join(",");
		}else{
			path = ["M", x1.toFixed(3), y1.toFixed(3), "L", x2.toFixed(3), y2.toFixed(3)].join(",");
		}
	} else{
		if (path_type == Drawable.Transition.PATH_CURVE) {
			//path = ["M", x1.toFixed(3), y1.toFixed(3), "C", x4, y4, x3, y3, x2.toFixed(3), y2.toFixed(3)].join(",");
			path = ["M", x1.toFixed(3), y1.toFixed(3), "R", x3.toFixed(3), y3.toFixed(3), x2.toFixed(3), y2.toFixed(3)].join(",");
		} else {
			//path = ["M", x1.toFixed(3), y1.toFixed(3), "L", x2.toFixed(3), y2.toFixed(3)].join(",");
			path = ["M", x1.toFixed(3), y1.toFixed(3), "L", x3.toFixed(3), y3.toFixed(3), "L", x2.toFixed(3), y2.toFixed(3)].join(",");
		}
	}
	var line = paper.path(path)
		.attr({stroke: color, fill: "none", 'arrow-end': 'classic-wide-long', 'stroke-width': highlight? 4 : 2});

	var clicked = false;
	if (!readonly) line
		.attr({'cursor': 'pointer'})
		.data("transition", transition_obj)
		.click(moveEndPoints);

	if (outline) line
		.toBack();

	var set_obj = paper.set();
	set_obj.push(line);
	var text_set = paper.set();
	var bbox = line.getBBox();

	// Reset the bubble setX, setY and only initialize when dragging
	// if (UI.Statemachine.isConnecting()){
	// 	//transition_obj.setX(Math.floor(bbox.x + bbox.width / 2 ) );
	// 	//transition_obj.setY(Math.floor(bbox.y + bbox.height / 2) );
	// } else {
	// 	if (transition_obj.getX() == undefined || transition_obj.getY() == undefined) {
	// 		transition_obj.setX(Math.floor(bbox.x + bbox.width / 2 ));
	// 		transition_obj.setY(Math.floor(bbox.y + bbox.height / 2));
	// 	}
	// }

	if (transition_obj.getOutcome() && !outline) {

		var text_obj;
		var center = {'x': bbox.x + bbox.width / 2, 'y': bbox.y + bbox.height / 2};
		if (!runtime_view && transition_obj.getX() != undefined && transition_obj.getY() != undefined){
			center.x = transition_obj.getX(); //+ UI.Statemachine.getPanShift().x; // move to screen coordinates
			center.y = transition_obj.getY(); //+ UI.Statemachine.getPanShift().y;
		}

		// Draw outcome text (centered by default)
		text_obj = paper.text(center.x, center.y, transition_obj.getOutcome())
			.attr({'font-size': 10, stroke: 'none',
				   'font-family': 'Arial,Helvetica,sans-serif',
				   'font-weight': 400,
				   fill: text_color});

		if (!readonly){
			// Add selection
			text_obj
			.attr({'cursor': 'pointer'})
			.data("transition", transition_obj)
			.click(resetTransition);
		}

		// Get the bounding box of the text object
		var textbb = text_obj.getBBox();
		var text_bg = paper.ellipse(center.x, // center x
									center.y, // center y
									(textbb.width  + 14) / 2,  // radius x
									(textbb.height + 10) / 2) // radius y
			.attr({'fill': 'rgba(100%, 100%, 100%, 80%)', 'stroke': color});

		if (!readonly){
			text_bg
			.attr({cursor: 'move', 'stroke-width': 1})
			.data("bubble", text_bg)
			.data("transition", transition_obj)
			.drag(Drawable.Helper.moveFncTransition, Drawable.Helper.startFncTransition, Drawable.Helper.endFncTransition);

			// Store data for later in case we start to drag (but not until then)
			if (transition_obj.getX() == undefined) {
				text_bg.data("set_x", Math.floor(bbox.x + bbox.width / 2 + 10));
			}
			if (transition_obj.getY() == undefined) {
				text_bg.data("set_y",Math.floor(bbox.y + bbox.height / 2));
			}
		}
		text_obj.toFront();
		text_set.push(text_obj);
		text_set.push(text_bg);
	}
	text_set.attr();
	set_obj.push(text_set);
	if (!(UI.Statemachine.isConnecting())){
		var begin = paper.ellipse(x1, y1, 5, 5)
			.attr({'fill': 'rgba(100%, 100%, 100%, 80%)', 'stroke': color, opacity: 0})
			.data("corners", cornersFrom);
			/*.click(function(){
				Drawable.Helper.endPointClick(begin, cornersFrom);
				transition_obj.setBeginning({
					x: begin.attr("cx"),
					y: begin.attr("cy")
				});
			});*/
		var end = paper.ellipse(x2, y2, 5, 5)
			.attr({'fill': 'rgba(100%, 100%, 100%, 80%)', 'stroke': color, opacity: 0})
			.data("corners", cornersTo);
			/*.click(function(){
				Drawable.Helper.endPointClick(end, cornersTo);
				transition_obj.setEnd({
					x: end.attr("cx"),
					y: end.attr("cy")
				});
			});*/
		var end_points_set = paper.set();
		end_points_set.push(begin);
		end_points_set.push(end);
		set_obj.push(end_points_set);
	}

	this.drawing = set_obj;
	this.obj = transition_obj;

	var merge_server = that;
	var merge_clients = [];

	this.merge = function(other) {
		/*if the transition object that called this method just connected,
		then it will move to the transition that already existed when merging*/
		var target, remove;
		if (transition_obj == UI.Statemachine.justConnected()){
			remove = that.getMergeServer();
			target = other.getMergeServer();
		} else {
			remove = other.getMergeServer();
			target = that.getMergeServer();
		}

		if(target.drawing[1][0] == undefined)
			return;
		var dx = target.drawing[1][0].attr('x')-remove.drawing[1][0].attr('x');
		var dy = target.drawing[1][0].attr('y')-remove.drawing[1][0].attr('y');

		remove.drawing[1].translate(dx,dy);
		if (UI.Statemachine.justConnected() != undefined){
			remove.obj.setX(remove.drawing[1][0].attr('x')+dx);
			remove.obj.setY(remove.drawing[1][0].attr('y')+dy);
			remove.obj.setBeginning(target.obj.getBeginning());
			remove.obj.setEnd(target.obj.getEnd());
		}

		if (target == remove) return;

		target = (that.obj.getAutonomy() <  other.obj.getAutonomy())? that.getMergeServer() : other.getMergeServer();
		remove = (that.obj.getAutonomy() >= other.obj.getAutonomy())? that.getMergeServer() : other.getMergeServer();

		var remove_shift_height = remove.calcShiftHeight();
		var target_shift_height = target.calcShiftHeight();

		//remove.drawing[0].attr({opacity: 0}).unclick();
		remove.drawing[0].attr({opacity: 0});
		target.drawing[1].translate(0, - remove_shift_height);
		target.getMergeClients().forEach(function(c) { c.drawing[1].translate(0, - remove_shift_height); });

		remove.setMergeServer(target);
		var new_clients = remove.getMergeClients();
		new_clients.push(remove);
		new_clients.forEach(function(c) {
			c.drawing[1].translate(0, target_shift_height);
			if (c.drawing[1][1] != undefined) {
				c.drawing[1][1].toFront();
				c.drawing[1][0].toFront();
			}
		});
		target.concatMergeClients(new_clients);
		remove.resetMergeClients();
	}

	this.getMergeServer = function() {
		return merge_server;
	}
	this.setMergeServer = function(new_server) {
		merge_server = new_server;
	}

	this.getMergeClients = function() {
		return merge_clients;
	}
	this.concatMergeClients = function(new_clients) {
		merge_clients = merge_clients.concat(new_clients);
	}
	this.resetMergeClients = function() {
		merge_clients = [];
	}

	this.calcShiftHeight = function() {
		return (that.drawing[1].getBBox().height + merge_clients.reduce(function(h, c) {
			return h + c.drawing[1].getBBox().height;
		}, 0)) / 2 + 1;
	}

};

Drawable.Transition.PATH_CURVE = 0;
Drawable.Transition.PATH_STRAIGHT = 1;
