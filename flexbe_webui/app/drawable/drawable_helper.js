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
		const ul_x = lx - this.data("bubble").attr("rx"); // center to upper left corner in screen coordinates
		const ul_y = ly - this.data("bubble").attr("ry"); // center to upper left corner in screen coordinates;
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
		lx = this.data("state").getPosition().x + UI.Statemachine.getPanShift().x; // coordinates on screen
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

		lx = trans.getX() + UI.Statemachine.getPanShift().x;  // transform center canvas coordinates to screen
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
		var new_pos = state.getPosition();
		if (UI.Statemachine.getDragIndicator().attr('width') > 1) {
			new_pos = UI.Statemachine.getDragIndicator().attr(['x', 'y']); // screen coordinates of upper left (as is state reference)
			new_pos.x -= UI.Statemachine.getPanShift().x; // screen to absolute coordinates
			new_pos.y -= UI.Statemachine.getPanShift().y;
		}

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

		if (UI.Statemachine.getDragIndicator().attr('width') > 1 || UI.Statemachine.getDragIndicator().attr('height') > 1) {
			// Calculate the center of the drag box
			new_pos = UI.Statemachine.getDragIndicator().attr(['x', 'y']);       // upper left screen coordinates
			new_pos.x += UI.Statemachine.getDragIndicator().getBBox().width / 2; // center screen coordinates
			new_pos.y += UI.Statemachine.getDragIndicator().getBBox().height / 2;
			new_pos.x -= UI.Statemachine.getPanShift().x;  // center screen to absolute canvas coordinates
			new_pos.y -= UI.Statemachine.getPanShift().y;
		}

		UI.Statemachine.getDragIndicator().attr({x: 0, y: 0, opacity: 0, width: 1, height: 1});  // move out of way and hide
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
		lx = this.data("point").attr("cx") + UI.Statemachine.getPanShift().x; // absolute to screen coordinates
		ly = this.data("point").attr("cy") + UI.Statemachine.getPanShift().y;
		ox = this.data("point").attr("cx") + UI.Statemachine.getPanShift().x;
		oy = this.data("point").attr("cy") + UI.Statemachine.getPanShift().y;
	}

	// returns true if point c is to the left of the line drawn by connecting points a and b
	// by calculating the 2D cross product of ab x ac
	this.isLeft = function(a, b, c){
		return ((b.x - a.x)*(c.y - a.y)) - ((b.y - a.y)*(c.x - a.x)) >= 0
	}

	this.moveFncEndPoint = function(dx, dy, x, y, evt) {
		x =  UI.Statemachine.getMousePos().getBBox().cx - UI.Statemachine.getPanShift().x; // account for movement of canvas
		y =  UI.Statemachine.getMousePos().getBBox().cy - UI.Statemachine.getPanShift().y; // by converting from screen to absolute coordinates

		var corners = this.data("corners"); //[top left, bottom left, bottom right, top right]
		if(x > corners[0].x && x < corners[2].x && y > corners[0].y && y<corners[2].y){
			// Only calculate move when we are beyond boundaries of the state box
			return;
		}

		let i_pos = that.clampToBox(x, y, corners);
		this.data("point").attr({"cx": i_pos.x, "cy": i_pos.y});

	}

	this.endPointClick = function(point, _corners){
		const x =  point.attr("cx"); // current location of end point
		const y =  point.attr("cy");

		let corners = _corners; //[top left, bottom left, bottom right, top right]

		if(x > corners[0].x && x < corners[2].x && y > corners[0].y && y<corners[2].y){
			// Only calculate move when we are beyond boundaries of the state box
			return;
		}

		let i_pos = that.clampToBox(x, y, corners);
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

	this.clampToBox = function(x, y, corners) {
		//
		var i_pos = {x, y};
		if(x > corners[0].x && x < corners[2].x && y > corners[0].y && y<corners[2].y){
			// Only calculate move when we are beyond boundaries of the state box
			// This should not happen as should be checked outside of this call
			return i_pos;
		}

		// Step 1: Compute the center of the box
		let centerX = (corners[0].x + corners[2].x) / 2;
		let centerY = (corners[0].y + corners[2].y) / 2;

		// Step 2: Compute direction vector from center to (x, y)
		let dx = x - centerX;
		let dy = y - centerY;

		if (dx === 0 && dy === 0) {
			// The point is already at the center, return the center itself
			return { x: centerX, y: centerY };
		}

		// Step 3: Find scaling factor (t) to move the point to the boundary
		// Function to find intersection of line with an edge
		function intersectWithEdge(cx, cy, dx, dy, edgeStart, edgeEnd) {
			let ex = edgeEnd.x - edgeStart.x;
			let ey = edgeEnd.y - edgeStart.y;

			let denominator = dx * ey - dy * ex;
			if (denominator === 0) return null; // Parallel lines, no intersection

			let t = ((edgeStart.x - cx) * ey - (edgeStart.y - cy) * ex) / denominator;
			let u = ((edgeStart.x - cx) * dy - (edgeStart.y - cy) * dx) / denominator;

			// Intersection must be within edge bounds (0 ≤ u ≤ 1)
			if (u < 0 || u > 1) return null;
			return t;
		}

		let tValues = [];
		corners.forEach((corner, i) => {
			let nextCorner = corners[(i + 1) % 4]; // Next corner in sequence (wraps around)
			let t = intersectWithEdge(centerX, centerY, dx, dy, corner, nextCorner);
			if (t !== null) {
				tValues.push(t);
			}
		});

		if (tValues.length != 0) {
			// Step 4: Use the smallest positive t to find the intersection point
			let tMin = Math.min(...tValues.filter(t => t > 0));
			i_pos.x = centerX + tMin * dx;
			i_pos.y = centerY + tMin * dy;
		}
		return i_pos;
	}

}) ();
