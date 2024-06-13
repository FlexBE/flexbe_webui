Drawable.Helper = new (function() {
	var that = this;

	var ox = 0, oy = 0, lx = 0, ly = 0;
	var traversed_positions = [];

	this.intersectsAnyOther = function(target_drawing, target_object) {
		// var intersects = false;
		const drawings = UI.Statemachine.getAllDrawings().filter(function (element) {
			return element.obj.getStateName != undefined;
		});
		for (let i = 0; i < drawings.length; ++i) {
			// not compare with state self
			if (drawings[i].obj.getStateName() == target_object.getStateName())
				continue;
			if (Raphael.isBBoxIntersect(target_drawing.getBBox(), drawings[i].drawing.getBBox()) ) {
				// intersects = true;
				return drawings[i];
			}
		}
		return false;
	}

	this.placeBeneath = function(target_object, target_drawing, other_drawing) {
		var o = other_drawing.getBBox();
		var t = target_drawing.getBBox();
		var m = 10; // margin

		var pos_above = o.y - m - t.height;
		var pos_right = o.x2 + m;
		var pos_below = o.y2 + m;
		var pos_left  = o.x - m - t.width;

		var transformations = [];
		transformations.push({ x: pos_right - t.x, y: 0 });
		if (pos_above > 20)
			transformations.push({ x: 0, y: pos_above - t.y });
		transformations.push({ x: 0, y: pos_below - t.y });
		if (pos_left > 0)
			transformations.push({ x: pos_left - t.x, y: 0 });

		var trans = transformations.reduce(function(prev, cur, i, a) {
			if(Math.abs(prev.x) + Math.abs(prev.y) < Math.abs(cur.x) + Math.abs(cur.y)) {
				return (traversed_positions.findElement(function(element, j) {
						return element.x == t.x + prev.x && element.y == t.y + prev.y;
					}) == undefined)? prev : cur;
			} else {
				return (traversed_positions.findElement(function(element, j) {
						return element.x == t.x + cur.x && element.y == t.y + cur.y;
					}) == undefined)? cur : prev;
			}
		});

		traversed_positions.push({ x: t.x + trans.x, y: t.y + trans.y });

		target_drawing.translate(trans.x, trans.y);
		target_object.getPosition().x += trans.x;
		target_object.getPosition().y += trans.y;
	}

	this.initialIntersectCheck = function(target_drawing, target_object) {
		var intersects = false;
		var temp = 0;
		traversed_positions = [];
		do {
			var other = that.intersectsAnyOther(target_drawing, target_object);
			intersects = other !== false;

			if (intersects) {
				that.placeBeneath(target_object, target_drawing, other.drawing);
				//target_drawing.translate(20, 0);
				//target_object.getPosition().x += 20;
			}
			temp++;
		} while(intersects && temp < 15);
		traversed_positions = [];
	}

	this.snapToCenter = function(x, y, w, h) {
		var gridsize = UI.Settings.getGridsize();
		var offset = {x: UI.Statemachine.getPanShift().x % gridsize, y: UI.Statemachine.getPanShift().y % gridsize};
		return {
			x: Raphael.snapTo(gridsize, x, gridsize / 2 + 1) - w/2 + gridsize + offset.x,
			y: Raphael.snapTo(gridsize, y, gridsize / 2 + 1) - h/2 + offset.y
		};
	}

	// Raphael func
	// state - object representing the state
	this.viewStateProperties = function() {
		if (!UI.Statemachine.isConnecting())
			UI.Panels.StateProperties.displayStateProperties(this.data("state"));
		else
			UI.Statemachine.connectTransition(this.data("state"));
	}

	// Raphael func
	// state - object representing the statemachine
	this.enterStatemachine = function() {
		if (!UI.Statemachine.isConnecting()) {
			UI.Statemachine.setDisplayedSM(this.data("state"));
			UI.Panels.hidePanelIfActive(UI.Panels.STATE_PROPERTIES_PANEL);
		}
		else {
			UI.Statemachine.connectTransition(this.data("state"));
		}
	}

	// Raphael func
	// state - object representing the behavior
	this.enterBehavior = function() {
		if (!UI.Statemachine.isConnecting()) {
			UI.Statemachine.setDisplayedSM(this.data("state").getBehaviorStatemachine());
			UI.Panels.hidePanelIfActive(UI.Panels.STATE_PROPERTIES_PANEL);
		}
		else {
			UI.Statemachine.connectTransition(this.data("state"));
		}
	}

	// Raphael func
	// state - object representing the state
	// box - rectangle matching the size of the movable object
	this.moveFnc = function(dx, dy, x, y, evt) {
		if (UI.Statemachine.isConnecting()) return;
		lx = dx + ox;
		ly = dy + oy;
		lx = Math.min(Math.max(lx, 0), UI.Statemachine.getR().width - this.data("box").attr("width"));
		ly = Math.min(Math.max(ly, 0), UI.Statemachine.getR().height - this.data("box").attr("height"));
		var i_pos = evt.shiftKey? that.snapToCenter(lx, ly, this.data("box").attr("width"), this.data("box").attr("height")) : {x: lx, y: ly};
		UI.Statemachine.getDragIndicator().attr({x: i_pos.x, y: i_pos.y, opacity: 1,
				width: this.data("box").attr("width"),
				height: this.data("box").attr("height")});
		if(that.intersectsAnyOther(UI.Statemachine.getDragIndicator(), this.data("state")))
			UI.Statemachine.getDragIndicator().attr({'stroke': '#F00', 'fill': 'rgba(100%, 0%, 0%, 50%)'});
		else
			UI.Statemachine.getDragIndicator().attr({'stroke': '#000', 'fill': 'rgba(50%, 100%, 40%, 15%)'});
	}

	// Raphael func
	// transition - object representing the transition
	// bubble - ellipse matching the size of the movable object
	this.moveFncTransition = function(dx, dy, x, y, evt) {
		if (UI.Statemachine.isConnecting()) return;
		lx = dx + ox;
		ly = dy + oy;
		lx = Math.min(Math.max(lx, 0), UI.Statemachine.getR().width - this.data("bubble").attr("rx")*2);
		ly = Math.min(Math.max(ly, 0), UI.Statemachine.getR().height - this.data("bubble").attr("ry")*2);
		const ul_x = lx - this.data("bubble").attr("rx");
		const ul_y = ly - this.data("bubble").attr("ry");
		let i_pos = {x: ul_x, y: ul_y};
		if (evt.shiftKey) {
			i_pos = that.snapToCenter(ul_x, ul_y, this.data("bubble").attr("rx")*2, this.data("bubble").attr("ry")*2);
		 }
		UI.Statemachine.getDragIndicator().attr({x: i_pos.x, y: i_pos.y, opacity: 1,
				width: this.data("bubble").attr("rx")*2,
				height: this.data("bubble").attr("ry")*2});
		/*if(that.intersectsAnyOther(UI.Statemachine.getDragIndicator(), this.data("state")))
			UI.Statemachine.getDragIndicator().attr({'stroke': '#F00', 'fill': 'rgba(100%, 0%, 0%, 50%)'});
		else
			UI.Statemachine.getDragIndicator().attr({'stroke': '#000', 'fill': 'rgba(50%, 100%, 40%, 15%)'});*/
	}

	// Raphael func
	// state - object representing the state
	this.startFnc = function() {
		if (UI.Statemachine.isConnecting()) return;
		lx = this.data("state").getPosition().x + UI.Statemachine.getPanShift().x;
		ly = this.data("state").getPosition().y + UI.Statemachine.getPanShift().y;
		ox = this.data("state").getPosition().x + UI.Statemachine.getPanShift().x;
		oy = this.data("state").getPosition().y + UI.Statemachine.getPanShift().y;
	}

	// Raphael func
	// transition - object representing the state
	this.startFncTransition = function() {
		if (UI.Statemachine.isConnecting()) return;

		var trans = this.data("transition");
		if (trans.getX() == undefined) {
			trans.setX(this.data("set_x")); // recovered stored value as we begin to move
		}
		if (trans.getY() == undefined) {
			trans.setY(this.data("set_y")); // recovered stored value as we begin to move
		}

		lx = trans.getX() + UI.Statemachine.getPanShift().x;
		ly = trans.getY() + UI.Statemachine.getPanShift().y;
		ox = trans.getX() + UI.Statemachine.getPanShift().x;
		oy = trans.getY() + UI.Statemachine.getPanShift().y;
	}

	// Raphael func
	// state - object representing the state
	this.endFnc = function(evt) {
		if (UI.Statemachine.isConnecting()) return;
		var state = this.data("state");
		var bbox = (UI.Statemachine.getDragIndicator().attr('width') > 1)?
			UI.Statemachine.getDragIndicator().getBBox():
			undefined;
		var container = state.getContainer();
		var state_name = state.getStateName();
		var old_pos = state.getPosition();
		var new_pos = (UI.Statemachine.getDragIndicator().attr('width') > 1)?
			UI.Statemachine.getDragIndicator().attr(['x', 'y']):
			state.getPosition();
		new_pos.x -= UI.Statemachine.getPanShift().x;
		new_pos.y -= UI.Statemachine.getPanShift().y;

		UI.Statemachine.getDragIndicator().attr({x: 0, y: 0, opacity: 0, width: 1, height: 1});
		state.setPosition(new_pos);
		var old_transitions = UI.Statemachine.shiftTransitions(state, old_pos);
		UI.Statemachine.refreshView();

		if(container == undefined) return;
		var container_path = container.getStatePath();

		var move_distance = Math.round(Math.sqrt(Math.pow(new_pos.x - old_pos.x, 2) + Math.pow(new_pos.y - old_pos.y, 2)));
		if (move_distance < 1) return;

		ActivityTracer.addActivity(ActivityTracer.ACT_STATE_CHANGE,
			"Moved " + state.getStateName().split('#')[0] + " for " + move_distance + " px",
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				var state = container.getStateByName(state_name);
				if (state == undefined) state = container.getSMOutcomeByName(state_name);
				state.setPosition(old_pos);
				UI.Statemachine.undoShiftTransitions(old_transitions);
				UI.Statemachine.refreshView();
			},
			function() {
				var container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				var state = container.getStateByName(state_name);
				if (state == undefined) state = container.getSMOutcomeByName(state_name);
				state.setPosition(new_pos);
				UI.Statemachine.shiftTransitions(state, old_pos);
				UI.Statemachine.refreshView();
			}
		);
		if (!RC.Controller.isReadonly()) {
			const covered_transitions = UI.Statemachine.getAllDrawings().filter(function (element) {
				return element instanceof Drawable.Transition &&
					element.obj.getFrom().getStateName() != "INIT" &&
					element.drawing[1][1] != undefined &&
					Raphael.isBBoxIntersect(bbox, element.drawing[1][1].getBBox()) &&
					element.obj.getFrom().getStateName() != state.getStateName();
			});
			covered_transitions.forEach(function (element) {
				var prev_target = element.obj.getTo();
				UI.Statemachine.resetTransition(element.obj);
				UI.Statemachine.connectTransition(state);
				if (state.getOutcomesUnconnected().length > 0) {
					UI.Statemachine.beginTransition(state, state.getOutcomesUnconnected()[0]);
					UI.Statemachine.connectTransition(prev_target);
				}
			});
			UI.Statemachine.refreshView();
		}
	}

	// Raphael func
	// transition - object representing the state
	this.endFncTransition = function(evt) {
		if (UI.Statemachine.isConnecting()) return;
		var transition = this.data("transition");
		/* var bbox = (UI.Statemachine.getDragIndicator().attr('width') > 1)?
			UI.Statemachine.getDragIndicator().getBBox():
			undefined; */
		/*var container = state.getContainer();
		var state_name = state.getStateName();*/
		var old_pos = {x: transition.getX(), y: transition.getY()};
		var new_pos = {x: transition.getX(), y: transition.getY()};

		if (UI.Statemachine.getDragIndicator().attr('width') > 1) {
			new_pos = UI.Statemachine.getDragIndicator().attr(['x', 'y']);
			// Calculate the center of the drag box
			new_pos.x += UI.Statemachine.getDragIndicator().getBBox().width / 2;
			new_pos.y += UI.Statemachine.getDragIndicator().getBBox().height / 2;
			new_pos.x -= UI.Statemachine.getPanShift().x;
			new_pos.y -= UI.Statemachine.getPanShift().y;
		}

		UI.Statemachine.getDragIndicator().attr({x: 0, y: 0, opacity: 0, width: 1, height: 1});
		transition.setX(new_pos.x);
		transition.setY(new_pos.y);
		UI.Statemachine.updateMergedTransitions(transition);
		UI.Statemachine.refreshView();

		/*if(container == undefined) return;
		var container_path = container.getStatePath();*/

		var move_distance = Math.round(Math.sqrt(Math.pow(new_pos.x - old_pos.x, 2) + Math.pow(new_pos.y - old_pos.y, 2)));
		if (move_distance < 1) return;

		ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
			"Moved " + transition.getOutcome() + " for " + move_distance + " px",
			function() {
				transition.setX(old_pos.x);
				transition.setY(old_pos.y);
				UI.Statemachine.updateMergedTransitions(transition);
				UI.Statemachine.refreshView();
			},
			function() {
				transition.setX(new_pos.x);
				transition.setY(new_pos.y);
				UI.Statemachine.updateMergedTransitions(transition);
				UI.Statemachine.refreshView();
			}
		);
	}

	this.startFncEndPoint = function() {
		if (UI.Statemachine.isConnecting()) return;
		lx = this.data("point").attr("cx")+ UI.Statemachine.getPanShift().x;
		ly = this.data("point").attr("cy")+ UI.Statemachine.getPanShift().y;
		ox = this.data("point").attr("cx")+ UI.Statemachine.getPanShift().x;
		oy = this.data("point").attr("cy")+ UI.Statemachine.getPanShift().y;
	}

	//returns true if point c is to the left of the line drawn by connecting points a and b
	this.isLeft = function(a, b, c){
		return ((b.x - a.x)*(c.y - a.y)) - ((b.y - a.y)*(c.x - a.x)) >= 0
	}

	this.moveFncEndPoint = function(dx, dy, x, y, evt) {
		x =  UI.Statemachine.getMousePos().getBBox().x;
		y =  UI.Statemachine.getMousePos().getBBox().y;
		var i_pos = {x, y};
		var corners = this.data("corners"); //[top left, bottom left, bottom right, top right]

		if(x > corners[0].x && x < corners[2].x && y > corners[0].y && y<corners[2].y){
			return;
		}

		var diagonal_point1;
		var diagonal_point2;
		var screen_height = UI.Statemachine.getR().height;
		var screen_width = UI.Statemachine.getR().width;
		if (y <= corners[0].y){
			diagonal_point1 = corners[0].y >= corners[0].x ? {x: 0, y: corners[0].y-corners[0].x} : {x: corners[0].x-corners[0].y, y: 0};
			diagonal_point2 = corners[3].y >= screen_width-corners[3].x ? {x: screen_width, y: corners[3].y - (screen_width-corners[3].x)} : {x: corners[3].x+corners[3].y, y:0};
			if(that.isLeft(diagonal_point2, corners[3], i_pos) && !(that.isLeft(diagonal_point1, corners[0], i_pos))){
				let x1 = (corners[0].x-(corners[0].y-y));
				x1 = x1 < 0 ? 0: x1;
				let x2 = (corners[3].x+(corners[3].y-y));
				x2 = x2 > screen_width ? screen_width : x2;
				let width = x2-x1
				i_pos.x = ((x-x1)/width) * (corners[3].x-corners[0].x);
				i_pos.x = i_pos.x+corners[0].x;
				i_pos.y = corners[0].y;
			}
			//if (corners[0].x < x && x < corners[3].x)

		}else if (y > corners[1].y){
			diagonal_point1 = screen_height - corners[1].y >= corners[1].x ? {x: 0, y:corners[1].y+corners[1].x} : {x: corners[1].x-(screen_height - corners[1].y), y:screen_height};
			diagonal_point2 = screen_height - corners[2].y >= screen_width - corners[2].x ? {x: screen_width, y:corners[2].y+(screen_width - corners[2].x)}: {x: corners[2].x+(screen_height - corners[2].y), y:screen_height};
			if(that.isLeft(corners[2], diagonal_point2, i_pos) && !(that.isLeft(corners[1], diagonal_point1, i_pos))){
				let x1 = corners[1].x-(y-corners[1].y);
				x1 = x1 < 0 ? 0: x1;
				let x2 = corners[2].x+(y-corners[2].y);
				x2 = x2 > screen_width ? screen_width : x2;
				let width = x2-x1;
				i_pos.x = ((x-x1)/width) * (corners[2].x-corners[1].x);
				i_pos.x = i_pos.x + corners[1].x
				i_pos.y = corners[1].y;
			}
			//if (corners[1].x < x && x < corners[2].x){
		}

		if(i_pos.x == x || i_pos.y == y){
			if (x < corners[0].x){
				let y1 = corners[0].y - (corners[0].x - x)
				y1 = y1 < 0 ? 0: y1;
				let y2 = corners[1].y + (corners[1].x - x);
				y2 = y2 > screen_height ? screen_height : y2;
				const height = y2-y1;
				i_pos.x = corners[0].x;
				i_pos.y = ((y-y1)/height) * (corners[1].y - corners[0].y);
				i_pos.y = i_pos.y + corners[0].y
			}
			else if (x > corners[3].x){
				let y1 = corners[3].y - (x - corners[3].x)
				y1 = y1 < 0 ? 0: y1;
				let y2 = corners[2].y + (x - corners[2].x);
				y2 = y2 > screen_height ? screen_height : y2;
				const height = y2-y1;
				i_pos.x = corners[3].x;
				i_pos.y = ((y-y1)/height) * (corners[2].y - corners[3].y);
				i_pos.y = i_pos.y + corners[3].y
			}
		}

		this.data("point").attr({"cx": i_pos.x, "cy": i_pos.y});

	}

	this.endPointClick = function(point, _corners){
		const x =  point.attr("cx");
		const y =  point.attr("cy");
		let i_pos = {x, y};
		let corners = _corners; //[top left, bottom left, bottom right, top right]

		if(x > corners[0].x && x < corners[2].x && y > corners[0].y && y<corners[2].y){
			return;
		}

		let diagonal_point1;
		let diagonal_point2;
		let screen_height = UI.Statemachine.getR().height;
		let screen_width = UI.Statemachine.getR().width;
		if (y <= corners[0].y){
			diagonal_point1 = corners[0].y >= corners[0].x ? {x: 0, y: corners[0].y-corners[0].x} : {x: corners[0].x-corners[0].y, y: 0};
			diagonal_point2 = corners[3].y >= screen_width-corners[3].x ? {x: screen_width, y: corners[3].y - (screen_width-corners[3].x)} : {x: corners[3].x+corners[3].y, y:0};
			if(that.isLeft(diagonal_point2, corners[3], i_pos) && !(that.isLeft(diagonal_point1, corners[0], i_pos))){
				let x1 = (corners[0].x-(corners[0].y-y));
				x1 = x1 < 0 ? 0: x1;
				let x2 = (corners[3].x+(corners[3].y-y));
				x2 = x2 > screen_width ? screen_width : x2;
				const width = x2-x1
				i_pos.x = ((x-x1)/width) * (corners[3].x-corners[0].x);
				i_pos.x = i_pos.x+corners[0].x;
				i_pos.y = corners[0].y;
			}
			//if (corners[0].x < x && x < corners[3].x)

		}else if (y > corners[1].y){
			diagonal_point1 = screen_height - corners[1].y >= corners[1].x ? {x: 0, y:corners[1].y+corners[1].x} : {x: corners[1].x-(screen_height - corners[1].y), y:screen_height};
			diagonal_point2 = screen_height - corners[2].y >= screen_width - corners[2].x ? {x: screen_width, y:corners[2].y+(screen_width - corners[2].x)}: {x: corners[2].x+(screen_height - corners[2].y), y:screen_height};
			if(that.isLeft(corners[2], diagonal_point2, i_pos) && !(that.isLeft(corners[1], diagonal_point1, i_pos))){
				let x1 = corners[1].x-(y-corners[1].y);
				x1 = x1 < 0 ? 0: x1;
				let x2 = corners[2].x+(y-corners[2].y);
				x2 = x2 > screen_width ? screen_width : x2;
				const width = x2-x1;
				i_pos.x = ((x-x1)/width) * (corners[2].x-corners[1].x);
				i_pos.x = i_pos.x + corners[1].x
				i_pos.y = corners[1].y;
			}
			//if (corners[1].x < x && x < corners[2].x){
		}

		if(i_pos.x == x || i_pos.y == y){
			if (x < corners[0].x){
				let y1 = corners[0].y - (corners[0].x - x)
				y1 = y1 < 0 ? 0: y1;
				let y2 = corners[1].y + (corners[1].x - x);
				y2 = y2 > screen_height ? screen_height : y2;
				const height = y2-y1;
				i_pos.x = corners[0].x;
				i_pos.y = ((y-y1)/height) * (corners[1].y - corners[0].y);
				i_pos.y = i_pos.y + corners[0].y
			}
			else if (x > corners[3].x){
				let y1 = corners[3].y - (x - corners[3].x)
				y1 = y1 < 0 ? 0: y1;
				let y2 = corners[2].y + (x - corners[2].x);
				y2 = y2 > screen_height ? screen_height : y2;
				const height = y2-y1;
				i_pos.x = corners[3].x;
				i_pos.y = ((y-y1)/height) * (corners[2].y - corners[3].y);
				i_pos.y = i_pos.y + corners[3].y
			}
		}

		point.attr({"cx": i_pos.x, "cy": i_pos.y})
	}

	// Raphael func
	// state - object representing the state
	// label - name of the transition to begin
	this.beginTransition = function() {
		if (RC.Controller.isReadonly()) return;

		if (!UI.Statemachine.isConnecting())
			UI.Statemachine.beginTransition(this.data("state"), this.data("label"));
		else
			UI.Statemachine.connectTransition(this.data("state"));
	}

	// Raphael func
	// state - object representing the state
	this.connectTransition = function() {
		UI.Statemachine.connectTransition(this.data("state"));
	}

}) ();
