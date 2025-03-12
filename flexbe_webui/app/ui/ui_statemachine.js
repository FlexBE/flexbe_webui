UI.Statemachine = new (function() {
	var that = this;

	var R = undefined;
	var drag_indicator = undefined;
	var displayed_sm = undefined;
	var selection_area = undefined;
	var selection_set = undefined;
	var selection_dx = undefined;
	var selection_dy = undefined;

	var pan_origin = {x: 0, y: 0};
	var pan_shift = {x: 0, y: 0};
	var sm_extents = undefined;
	var drawings = [];
	var drag_transition;
	var drag_transition_drawing;
	var previous_transition_end;
	var connecting = false;
	var just_connected;
	var selecting = false;
	var allow_panning = false;
	var panning = false;
	var mouse_pos = undefined;
	var mouse_text = undefined;
	var background = undefined;
	var dataflow_displayed = false;
	var comments_displayed = true;
	var outcomes_displayed = true;

	var drawn_sms = [];
	var grid = [];

	var tab_targets = [];

	Mousetrap.bind("shift", function() {
		displayGrid();
		background.attr({'cursor': 'move'});
		allow_panning = true;
	}, 'keydown');
	Mousetrap.bind("shift", function() {
		hideGrid();
		background.attr({'cursor': 'auto'});
		allow_panning = false;
		panning = false;
	}, 'keyup');

	Mousetrap.bind("shift+space", function() {
		T.logInfo(`shift+space - Go to Home position ...`)
		panShift(-pan_shift.x, -pan_shift.y);
	});

	Mousetrap.bind("shift+home", function() {
		T.logInfo(`shift+home - Go to Home position ...`)
		panShift(-pan_shift.x, -pan_shift.y);
	});

	Mousetrap.bind("shift+end", function() {
		// Move to zero starting position
		T.logInfo(`shift+end - pan to canvas extents ...`);
		if (sm_extents == undefined) {
			T.logInfo(`     Undefined extents - ignore panShift to extents.`)
			return;
		}
		let xc = sm_extents.x - R.width;
		let yc = sm_extents.y - R.height;
		if (xc < 0) xc = 0;
		if (yc < 0) yc = 0;
		panShift(-pan_shift.x - xc, -pan_shift.y - yc);
	});

	Mousetrap.bind("shift+left", function() {
		T.logInfo(`shift+left - pan left ...`);
		panShift(UI.Settings.getGridsize(), 0);
	});
	Mousetrap.bind("shift+right", function() {
		T.logInfo(`shift+right - pan right ...`);
		panShift(-UI.Settings.getGridsize(), 0);
	});
	Mousetrap.bind("shift+up", function() {
		T.logInfo(`shift+up - pan up ...`);
		panShift(0, UI.Settings.getGridsize());
	});
	Mousetrap.bind("shift+down", function() {
		T.logInfo(`shift+down - pan down ...`);
		panShift(0, -UI.Settings.getGridsize());
	});

	var panShift = function(dx, dy) {
		if (!allow_panning) {
			T.logInfo(`    Panning is not allowed in this configuration!`);
			return;
		}
		hideGrid();
		pan_shift.x += dx;
		pan_shift.y += dy;
		if (pan_shift.x > 0 ) {
			dx =  dx - pan_shift.x
			T.logInfo(`Limit pan shift! (${dx}, ${dy}) current pan(${pan_shift.x}, ${pan_shift.y})`);
			pan_shift.x = 0;
		}
		if (pan_shift.y > 0 ) {
			dy = dy - pan_shift.y;
			T.logInfo(`Limit pan shift! (${dx}, ${dy}) current pan(${pan_shift.x}, ${pan_shift.y})`);
			pan_shift.y = 0;
		}
		drawings.forEach(function(entry) {
			if (entry.obj instanceof State && entry.obj.getStateClass() == ':CONTAINER') return;
			let d = entry.drawing;
			//T.logInfo(`  drawing BB  pre = ${JSON.stringify(d.getBBox())} (${dx}, ${dy})  ${d}`);
			d.translate(dx, dy);
			//T.logInfo(`  drawing BB  post= ${JSON.stringify(d.getBBox())}`)
		});
		T.logInfo(`Pan shifted: dx, dy=(${dx}, ${dy})  pan shift=(${pan_shift.x}, ${pan_shift.y}).`)

		if (!panning) displayGrid();
	}

	var updateMousePos = function(event) {
		mouse_pos.attr({ cx: event.offsetX, cy: event.offsetY });
		mouse_text.attr({ x: event.offsetX, y: event.offsetY  - 15, text: `(${event.offsetX}, ${event.offsetY})`});
		if (connecting) that.refreshView();
	}

	var displayGrid = function() {
		let gridsize = UI.Settings.getGridsize();
		let offset = {x: UI.Statemachine.getPanShift().x % gridsize, y: UI.Statemachine.getPanShift().y % gridsize};
		for (let i = offset.x; i < R.width; i += gridsize) {
			grid.push(R.path("M" + i + ",0L" + i + "," + R.height).attr({stroke: '#ddd'}));
		}
		for (let i = offset.y; i < R.height; i += gridsize) {
			grid.push(R.path("M0," + i + "L" + R.width + "," + i).attr({stroke: '#ddd'}));
		}
	}
	var hideGrid = function() {
		grid.forEach(function(el) { el.remove(); });
		grid = [];
	}

	var beginSelection = function(x, y, event) {
		if (allow_panning) {
			panning = true;
			pan_origin.x = x;
			pan_origin.y = y;

			that.removeSelection();
			hideGrid();

		} else {
			if (connecting) return;
			selecting = true;

			let mx = mouse_pos.attr("cx");
			let my = mouse_pos.attr("cy");

			selection_area.attr({opacity: 1, x: mx, y: my, width: 0, height: 0}).toFront();
			selection_area.transform(""); // Clear the current transform
		}
	}

	var updateSelection = function(dx, dy, x, y, event) {
		if (panning) {
			let shift = {x: x - pan_origin.x, y: y - pan_origin.y};
			panShift(shift.x, shift.y);
			pan_origin.x = x;
			pan_origin.y = y;
		}
		if (selecting) {
			let newWidth = Math.abs(dx);  // New width of the selection area based on drag distance
			let newHeight = Math.abs(dy); // New height of the selection area based on drag distance

			// Determine the new top-left corner position (adjusts for dragging in any direction, and handles page offset)
			let newX = selection_area.attr("x");
			if (dx < 0) newX += selection_area.attr("width") + dx;
			let newY = selection_area.attr("y");
			if (dy < 0) newY += selection_area.attr("height") + dy;

			// Update the selection area
			selection_area.attr({
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight
			});
		}
	}
	var endSelection = function(event) {
		if (panning) {
			displayGrid();
			panning = false;
		}
		if (!selecting) return;
		selecting = false;

		if (selection_area.attr("width") < 10 || selection_area.attr("height") < 10)
			that.removeSelection();
	}

	var beginSelectionMove = function(event) {
		// Grab the states within the selection
		that.selection_dx = undefined;
		that.selection_dy = undefined;

		if (that.isReadonly()) {
			console.log(`\x1b[93mCannot do selection move of behavior defined elsewhere! (read only)\x1b[0m`);
			return;
		}
		this.attr({cursor: "grab"});

		// Grab list of all states completely within the selection bounding box
		let state_names = that.getSelectedStates().map((element) => {return element.getStateName()});

		if (state_names.length > 0) {
			//console.log(`Selected ${JSON.stringify(state_names)}`);
			that.selection_set = state_names;
		} else {
			console.log(` no states are selected!`);
			that.selection_set = undefined;
		}
	}
	var updateSelectionMove = function(dx, dy, x, y, event) {
		if (that.isReadonly()) {
			return;
		}
		if (selection_area == undefined || that.selection_set == undefined) {
			console.log(`invalid selection ${selection_area} ${that.selection_set}`);
			return;
		}

		// Keep selection in bounds
		let curX = selection_area.attr('x'); // upper left corner of selection area
		let curY = selection_area.attr('y');
		if (curX + dx < 0) {
		    dx = -curX;
		}
		if (curY + dy < 0) {
		    dy = -curY;
		}
		that.selection_dx = dx;
		that.selection_dy = dy;
		selection_area.transform("T" + dx + "," + dy);
	}
	var endSelectionMove = function(event) {
		// Ensure selection_set is defined
		if (that.isReadonly()) {
			return;
		}
		this.attr({cursor: "pointer"});
		if (that.selection_set && that.selection_set.length > 0) {

			if (that.selection_dx == undefined || that.selection_dy == undefined) {
				console.log(`invalid motion data for selection set with ${that.selection_set ? that.selection_set.length : 0} items`);
				return;
			}
			const dx = that.selection_dx;
			const dy = that.selection_dy;

			translateSelectedStates(that.selection_set, dx, dy);

			const selectedStatePaths = that.selection_set.clone();
			// ActivityTracer to allow undo/redo
			ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
				`Move selected states ${JSON.stringify(selectedStatePaths)}.`,
				function() { // undo
					translateSelectedStates(selectedStatePaths, -dx, -dy);
				},
				function() { // redo
					translateSelectedStates(selectedStatePaths, dx, dy);
				}
			);

			// Clear the selection set
			that.selection_set.length = 0;
			that.selection_set = null; // Clear the reference to avoid memory leaks
			that.selection_dx = undefined;
			that.selection_dy = undefined;

		} else {
			console.log(`invalid selection data `);
		}

		// Now update the selection area attributes to match the current visual
		// Get the current transformation applied to the element
		let transformMatrix = selection_area.transform();

		// If it's a translation, extract the x and y offsets
		let translateX = 0;
		let translateY = 0;

		// Check if there is a translation in the transform
		if (transformMatrix.length > 0 && transformMatrix[0][0] === "T") {
			translateX = transformMatrix[0][1];  // Translation in the x direction
			translateY = transformMatrix[0][2];  // Translation in the y direction
		}

		// Get the current attributes of the selection area
		let currentX = selection_area.attr("x");
		let currentY = selection_area.attr("y");

		// Update the selection area's actual x and y based on the translation
		selection_area.attr({
			x: currentX + translateX,
			y: currentY + translateY
		});

		// Reset the transform to avoid double transformations
		selection_area.transform(""); // Clear the current transform
	}

	var translateSelectedStates = function(selected_states, dx, dy) {
		console.log(`\x1b[93mTranslate ${selected_states.length} selected states by delta=(${dx}, ${dy}) `
			+ ` in '${displayed_sm.getStatePath()}' \x1b[0m`);

		let stateObjects = [];
		selected_states.forEach( (name) => {
			const state = displayed_sm.getStateByName(name);
			if (state != undefined) {
				state.translate(dx, dy);
				stateObjects.push(state); // for use in transition selection
			} else {
				console.log(`    cannot find state for '${name}' in container '${displayed_sm.getStatePath()}'`);
			}
		})

		let selected_transitions = displayed_sm.getTransitions().filter(function(t) {
			if (t.getFrom().getStateName() == "INIT") return false;
			let from_state = stateObjects.findElement(function (element) { return element.getStateName() == t.getFrom().getStateName() });
			let to_state = stateObjects.findElement(function (element) { return element.getStateName() == t.getTo().getStateName() });
			const from_def = from_state != undefined;
			const to_def = to_state != undefined;
			if ((from_def || to_def) && !(from_def && to_def)) {
				console.log(`    ignoring transition '${t.getFrom() ? t.getFrom().getStateName() : 'undefined'}' to `
							+ ` '${t.getTo() ? t.getTo().getStateName() : 'undefined'}' that is not fully contained in selection!`)
			}
			return from_def && to_def; // only translate if both ends are selected
		});

		selected_transitions.forEach(function(t) {
			// Move each drawing element by dx and dy
			try {
				// transition
				// console.log(`    translating transition from `
				// 			+ `'${t.getFrom() ? t.getFrom().getStateName() : 'undefined'}' to `
				// 			+ `'${t.getTo() ? t.getTo().getStateName() : 'undefined'}'`);
				t.translate(dx, dy);
			} catch (err) {
				console.log('failed to transform ' + err);
			}
		});
		that.refreshView();
}

	var displayInitialDot = function() {
		let dummyStateObj = new State("INIT", WS.Statelib.getFromLib(":INIT"));
		let drawing = R.circle(10, 40, 5)
				.attr({fill: '#000'})
				.data("state", dummyStateObj)
				.data("label", "")
				.click(function() {
					if (connecting) return;
					UI.Statemachine.beginInitTransition();
				});
		if (!connecting) drawing.attr({cursor: 'pointer'});

		return {
			drawing: drawing,
			obj: dummyStateObj
		};
	}

	var displaySMPath = function() {
		return new Drawable.ContainerPath(displayed_sm, R, smDisplayHandler, background.attr('fill'));
	}

	var smDisplayHandler = function() {
		UI.Panels.StateProperties.hide();
		that.setDisplayedSM(this.data("statemachine"));
	}

	var initializeDrawingArea = function() {
		R = Raphael("drawing_area");
		drag_indicator = R.rect(0,0,1,1).attr({opacity: 0.5}); // @todo - opacity 0
		selection_area = R.rect(0,0,0,0).attr({
			opacity: 0,
			stroke: "#000", 'stroke-dasharray': "--",
			fill: "rgba(250,250,250,0.4)",
			'stroke-width': 0.5,
			cursor: "pointer"})
			.drag(updateSelectionMove, beginSelectionMove, endSelectionMove);

		mouse_pos = R.circle(0, 0, 2).attr({opacity: 0.5}); // @todo - opacity 0
		mouse_text = R.text(R.width / 2, R.height/2 + 10, `(${R.width/2}, ${R.height/2})`)
						.attr({'font-size': 16, 'fill': 'gray'}); // @todo - remove text

		background = R.rect(0, 0, R.width, R.height)
			.attr({fill: '#FFF', stroke: '#FFF'}).toBack()
			.mousemove(updateMousePos)
			.drag(updateSelection, beginSelection, endSelection)
			.click(function() { document.activeElement.blur(); });
		sm_extents = {x: R.width, y: R.height};
	}


	this.initialize = function() {
		initializeDrawingArea();

		displayed_sm = Behavior.getStatemachine();
	}

	this.recreateDrawingArea = function() {
		// clear
		for (let i=0; i<drawings.length; ++i) {
			drawings[i].drawing.remove();
		}
		drawings = [];

		if (R != undefined) {
			R.remove();
		}

		initializeDrawingArea();
		that.refreshView();
	}

	this.toggleDataflow = function() {
		dataflow_displayed = !dataflow_displayed;

		if (UI.Menu.isPageStatemachine()) that.refreshView();
	}

	this.isDataflow = function() {
		return dataflow_displayed;
	}

	this.toggleComments = function() {
		comments_displayed = !comments_displayed;

		if (UI.Menu.isPageStatemachine()) that.refreshView();
	}

	this.toggleOutcomes = function() {
		outcomes_displayed = !outcomes_displayed;

		if (UI.Menu.isPageStatemachine()) that.refreshView();
	}

	this.getR = function() {
		return R;
	}

	this.getDragIndicator = function() {
		return drag_indicator;
	}

	this.getMousePos = function() {
		return mouse_pos;
	}

	this.getPanShift = function() {
		return pan_shift;
	}

	this.getAllDrawings = function() {
		return drawings;
	}

	this.getDisplayedSM = function() {
		return displayed_sm;
	}

	this.setDisplayedSM = function(statemachine) {
		displayed_sm = statemachine;
		connecting = false;
		drag_transition = undefined;
		that.removeSelection();
		pan_shift = {x: 0, y: 0};

		if (UI.Menu.isPageStatemachine()) that.refreshView();
	}

	this.resetStatemachine = function() {
		drawn_sms = [];
		that.setDisplayedSM(Behavior.getStatemachine());
	}

	this.removeSelection = function() {
		selecting = false;
		selection_area.attr({x: 0, y: 0, width: 0, height: 0, opacity: 0});
	}

	this.isConnecting = function() {
		return connecting;
	}

	this.justConnected = function() {
		return just_connected;
	}

	this.isReadonly = function() {
		return RC.Controller.isReadonly() || displayed_sm.isInsideDifferentBehavior() || Behavior.isReadonly();
	}

	this.applyLayeredGraphLayout = function() {
		that.refreshView();

		let g = new dagre.graphlib.Graph();

		// Set an object for the graph label
		g.setGraph({rankdir: 'LR'});

		// Default to assigning a new object as a label for each new edge.
		g.setDefaultEdgeLabel(function() { return {}; });

		let node_drawings = drawings.filter(function(element) {
			return (
				element.obj instanceof State
				|| element.obj instanceof Statemachine
				|| element.obj instanceof BehaviorState
				) && (
				!element.obj.getStateClass().startsWith(":")
				|| element.obj.getStateClass() == ":OUTCOME"
				|| element.obj.getStateClass() == ":STATEMACHINE"
			);
		});
		if (node_drawings.length == 0) return;
		let transitions = displayed_sm.getTransitions();

		// generate node array
		let nodes = [];
		for (let i=0; i<node_drawings.length; i++) {
			let n = node_drawings[i].drawing.getBBox();
			g.setNode(node_drawings[i].obj.getStateName(), {width: n.width, height: n.height});
			//nodes.push({x: n.x + n.width/2, y: n.y + n.height/2, fixed: false});
		}

		// generate link array
		let links = [];
		for (let i=0; i<transitions.length; i++) {
			let t = transitions[i];
			if (t.getFrom().getStateName() == "INIT") continue;
			g.setEdge(t.getFrom().getStateName(), t.getTo().getStateName());
		}
		dagre.layout(g);

		// update state positions
		g.nodes().forEach(function (n){
			let state = node_drawings.findElement(function (element) {
				return n == element.obj.getStateName();
			}).obj;
			state.setPosition({x: g.node(n).x, y: g.node(n).y});
		});

		//update transition positions
		g.edges().forEach( function(e){
			let t = transitions.filter(function(element) {
				return (element.getTo().getStateName() == e.w && element.getFrom().getStateName() == e.v);
			});
			t = t[0];
			t.setX(g.edge(e).x);
			t.setY(g.edge(e).y);
		});

	}
	this.applyGraphLayout = function() {
		that.refreshView();

		let node_drawings = drawings.filter(function(element) {
			return (
				element.obj instanceof State
				|| element.obj instanceof Statemachine
				|| element.obj instanceof BehaviorState
				) && (
				!element.obj.getStateClass().startsWith(":")
				|| element.obj.getStateClass() == ":OUTCOME"
				|| element.obj.getStateClass() == ":STATEMACHINE"
			);
		});
		if (node_drawings.length == 0) return;
		let transitions = displayed_sm.getTransitions();

		// generate node array
		let nodes = [];
		for (let i=0; i<node_drawings.length; i++) {
			let n = node_drawings[i].drawing.getBBox();
			nodes.push({x: n.x + n.width/2, y: n.y + n.height/2, fixed: false});
		}
		nodes.push({x: 10, y: 40, fixed: true});

		// generate link array
		let links = [];
		for (let i=0; i<transitions.length; i++) {
			let t = transitions[i];
			if (t.getFrom().getStateName() == "INIT") continue;
			let from = node_drawings.indexOf(node_drawings.findElement(function (element) {
				return t.getFrom().getStateName() == element.obj.getStateName();
			}));
			let to = node_drawings.indexOf(node_drawings.findElement(function (element) {
				return t.getTo().getStateName() == element.obj.getStateName();
			}));
			links.push({source: from, target: to});
		}
		if (displayed_sm.getInitialState() != undefined) {
			let from_init = node_drawings.length;
			let to_init = node_drawings.indexOf(node_drawings.findElement(function (element) {
				return displayed_sm.getInitialState().getStateName() == element.obj.getStateName();
			}));
			links.push({source: from_init, target: to_init});
		}

		// apply layout algorithm
		/*let force = d3.layout.force()
			.nodes(nodes)
			.links(links)
			.size([R.width, R.height])
			.linkDistance(function(link, i) {
				return (link.source.index == node_drawings.length)? 30 : 200;
			})
			.gravity(0.05)
			.charge(-100)
			.linkStrength(1);*/
		let force = cola.d3adaptor()
			.nodes(nodes)
			.links(links)
			.linkDistance (function(link, i) {
				return (link.source.index == node_drawings.length)? 30 : 200;
			})
			.size([R.width, R.height]);

		force.start();
		for (let i = 0; i < 20; ++i) force.tick();
		force.stop();

		// update state positions
		nodes = force.nodes();
		for (let i=0; i<node_drawings.length; i++) {
			let s = node_drawings[i].obj;
			let temp_x;
			let temp_y;

			if (nodes[i].x < 0) temp_x = 0;
			else if (nodes[i].x > R.width) temp_x = R.width;
			else temp_x = nodes[i].x;

			if (nodes[i].y < 0) temp_y = 0;
			else if (nodes[i].y > R.height) temp_y = R.height;
			else temp_y = nodes[i].y;
			//s.setPosition({x: nodes[i].x, y: nodes[i].y});
			s.setPosition({x: temp_x, y: temp_y});
		}
	}

	this.fireEvent = function (element,event) {
		let evt = new Event(event, { bubbles: true, cancelable: true });
		return !element.dispatchEvent(evt);
	}

	this.refreshView = function() {
		if (drag_transition_drawing != undefined) {
			drag_transition_drawing.drawing.remove();
			drag_transition_drawing = undefined;
		}
		if (connecting) {
			drag_transition_drawing = new Drawable.Transition(drag_transition, R, false, drawings, false, false, Drawable.Transition.PATH_CURVE);
			return;
		}

		// clear
		for (let i=0; i<drawings.length; ++i) {
			drawings[i].drawing.remove();
		}
		drawings = [];

		// draw
		drawings.push(displayInitialDot());

		if (!displayed_sm){
			// This gets triggered by resize call prior to statemachine setup
			console.log(`\x1b[91m ui.SM.refreshView - displayed_sm is undefined!\x1b[0m`);
			return;
		}

		if (dataflow_displayed) {
			displayed_sm.updateDataflow();
		}

		// get statemachine data
		let states = displayed_sm.getStates();
		let sm_outcomes = displayed_sm.getSMOutcomes();
		let transitions = displayed_sm.getTransitions();
		let dataflow = displayed_sm.getDataflow();

		sm_extents = {x:0, y:0};

		for (let i=0; i<states.length; ++i) {
			let s = states[i];
			let a = RC.Controller.isRunning() && RC.Controller.isCurrentState(s, true);
			let l = RC.Controller.isLocked() && RC.Controller.isOnLockedPath(s.getStatePath());
			if (s instanceof Statemachine)
				drawings.push(new Drawable.Statemachine(s, R, false, Drawable.State.Mode.OUTCOME, a, l));
			else if (s instanceof BehaviorState)
				drawings.push(new Drawable.BehaviorState(s, R, false, Drawable.State.Mode.OUTCOME, a, l));
			else
				drawings.push(new Drawable.State(s, R, false, Drawable.State.Mode.OUTCOME, a, l));

			if (s.getPosition().x > sm_extents.x) sm_extents.x = s.getPosition().x + UI.Settings.getGridsize()*2;
			if (s.getPosition().y > sm_extents.y) sm_extents.y = s.getPosition().y + UI.Settings.getGridsize()*2;

		}
		for (let i=0; i<sm_outcomes.length; ++i) {
			o = sm_outcomes[i];
			let obj = new Drawable.Outcome(o, R, false, !outcomes_displayed);
			drawings.push(obj);
			if (o.getPosition().x > sm_extents.x) sm_extents.x = o.getPosition().x + UI.Settings.getGridsize();
			if (o.getPosition().y > sm_extents.y) sm_extents.y = o.getPosition().y + UI.Settings.getGridsize();
		}

		// draw transitions at last
		let transitions_readonly = RC.Controller.isReadonly() || dataflow_displayed || displayed_sm.isInsideDifferentBehavior() || Behavior.isReadonly();
		let new_transitions = [];
		for (let i=0; i<transitions.length; ++i) {
			let t = transitions[i];
			if (t.getTo() == undefined) continue;
			if (drag_transition != undefined && t.getFrom().getStateName() == drag_transition.getFrom().getStateName() && t.getOutcome() == drag_transition.getOutcome()) continue;
			let draw_outline = dataflow_displayed || !outcomes_displayed && (t.getTo().getStateClass() == ":OUTCOME" || t.getTo().getStateClass() == ":CONDITION")
			let dt = new Drawable.Transition(t, R, transitions_readonly, drawings, false, draw_outline, Drawable.Transition.PATH_CURVE);
			if (t.getBeginning() != undefined){
				Drawable.Helper.endPointClick(dt.drawing[2][0], dt.drawing[2][0].data("corners"));
				t.setBeginning({
					x: dt.drawing[2][0].attr("cx"),
					y: dt.drawing[2][0].attr("cy")
				});
				// that.fireEvent(dt.drawing[2][0].node, 'click');
			}
			if (t.getEnd() != undefined){
				Drawable.Helper.endPointClick(dt.drawing[2][1], dt.drawing[2][1].data("corners"));
				t.setEnd({
					x: dt.drawing[2][1].attr("cx"),
					y: dt.drawing[2][1].attr("cy")
				});
				// that.fireEvent(dt.drawing[2][1].node, 'click');
			}
			new_transitions.forEach(function(ot) {
				if (dt.obj.getFrom().getStateName() == ot.obj.getFrom().getStateName() && dt.obj.getTo().getStateName() == ot.obj.getTo().getStateName()) {
					dt.merge(ot);
				}
			});
			new_transitions.push(dt);
			drawings.push(dt);

			if (t.getX() != undefined && t.getX() > sm_extents.x) sm_extents.x = t.getX() + UI.Settings.getGridsize()*2;
			if (t.getY() != undefined && t.getY() > sm_extents.y) sm_extents.y = t.getY() + UI.Settings.getGridsize()*2;
		}

		new_transitions = [];
		if (dataflow_displayed) {
			for (let i=0; i<dataflow.length; ++i) {
				let d = dataflow[i];
				let color = '#000';
				if (d.getFrom().getStateName() == "INIT" && !displayed_sm.isInsideDifferentBehavior()) {
					let available_userdata = (displayed_sm == Behavior.getStatemachine())?
						Behavior.getDefaultUserdata().map(function(obj) { return obj.key; }) :
						displayed_sm.getInputKeys();
					if (!available_userdata.contains(d.getOutcome())) {
						color = '#900';
						d.setAutonomy(-1);
					} else {
						d.setAutonomy(0);
					}
				}
				let dt = new Drawable.Transition(d, R, true, drawings, false, false, Drawable.Transition.PATH_STRAIGHT, color);
				new_transitions.forEach(function(ot) {
					if (dt.obj.getFrom().getStateName() == ot.obj.getFrom().getStateName() && dt.obj.getTo().getStateName() == ot.obj.getTo().getStateName()) {
						dt.merge(ot);
					}
				});
				new_transitions.push(dt);
				drawings.push(dt);
			}
		}

		// draw comment notes
		if (comments_displayed) {
			let notes = Behavior.getCommentNotes().filter(function(n) { return n.getContainerPath() == displayed_sm.getStatePath(); });
			for (let i = 0; i < notes.length; i++) {
				let n = new Drawable.Note(notes[i], R);
				drawings.push(n);
				if (notes[i].getContent() == "") n.editNote();
			}
		}

		if (RC.Controller.isReadonly()) {
			background.attr({fill: '#f3f6ff', stroke: '#c5d2ee'});
		} else if (displayed_sm.isInsideDifferentBehavior() || Behavior.isReadonly()) {
			background.attr({fill: '#fff3f6'});
		} else {
			background.attr({fill: '#FFF'});
		}
		background.toBack();
		selection_area.toFront();

		drawings.push(displaySMPath());

		// update menu button toggle state
		if (UI.Menu.isPageStatemachine()) {
			let dfgButton = document.getElementById("tool_button Data Flow Graph");
			dfgButton.setAttribute("style", dataflow_displayed? "background: #ccc" : "");
			let hocButton = document.getElementById("tool_button Fade Outcomes");
			hocButton.setAttribute("style", !outcomes_displayed? "background: #ccc" : "");
			let hcButton = document.getElementById("tool_button Hide Comments");
			hcButton.setAttribute("style", !comments_displayed? "background: #ccc" : "");
		}
		// apply current pan shift
		drawings.forEach(function(entry) {
			if (entry.obj instanceof State && entry.obj.getStateClass() == ':CONTAINER') return;
			let d = entry.drawing;
			d.translate(pan_shift.x, pan_shift.y);
			d.mousemove(updateMousePos);
		});
	}

	this.getDrawnState = function(state) {
		for (let i=0; i<drawings.length; ++i) {
			if(drawings[i].obj.getStateName() == state.getStateName()) {
				return drawings[i].drawing;
			}
		}
	}

	this.beginTransition = function(state, label) {
		if (connecting) return;
		that.removeSelection();

		let autonomy = 0;
		let autonomy_index = state.getOutcomes().indexOf(label);
		if (autonomy_index != -1)
			autonomy = state.getAutonomy()[autonomy_index];

		drag_transition = new Transition(state, undefined, label, autonomy);
		previous_transition_end = undefined;

		that.refreshView();
		connecting = true;
		that.refreshView();
	}

	this.beginInitTransition = function() {
		if (connecting) return;
		that.removeSelection();

		if (displayed_sm.getInitialState() != undefined) {
			previous_transition_end = displayed_sm.getInitialState().getStateName();
		} else {
			previous_transition_end = undefined;
		}
		displayed_sm.setInitialState(undefined);

		drag_transition = displayed_sm.getInitialTransition();

		that.refreshView();
		connecting = true;
		that.refreshView();
	}

	this.abortTransition = function() {
		if (!connecting) return;

		if (drag_transition == displayed_sm.getInitialTransition()) {
			displayed_sm.setInitialState(displayed_sm.getStateByName(previous_transition_end));
		} else if (previous_transition_end != undefined) {
			let old_to = displayed_sm.getStateByName(previous_transition_end);
			if (old_to == undefined) {
				old_to = displayed_sm.getSMOutcomeByName(previous_transition_end);
			}
			drag_transition.setTo(old_to);
		}

		connecting = false;
		just_connected = drag_transition;
		drag_transition = undefined;
		that.refreshView();
		just_connected = undefined;
		that.refreshView();
	}

	this.resetTransition = function(transition) {
		if (connecting) return;
		transition.setBeginning(undefined);
		transition.setEnd(undefined);
		drag_transition = transition;
		previous_transition_end = drag_transition.getTo().getStateName();
		drag_transition.setTo(undefined);

		that.refreshView();
		connecting = true;
		that.refreshView();
	}

	this.removeTransition = function() {
		T.logInfo(`** ui_statemachine : removeTransition ret conn=${!connecting} ... `);
		if (!connecting) return;
		if (!displayed_sm.hasTransition(drag_transition)) {
			that.abortTransition();
			return;
		}

		let is_initial = drag_transition == displayed_sm.getInitialTransition();
		let from = drag_transition.getFrom().getStateName();
		let to = previous_transition_end;
		let outcome = drag_transition.getOutcome();
		let autonomy = drag_transition.getAutonomy();
		let container_path = displayed_sm.getStatePath();

		if (!is_initial) {
			displayed_sm.removeTransitionObject(drag_transition);
		} else {
			displayed_sm.setInitialState(undefined);
		}
		connecting = false;
		drag_transition = undefined;
		that.refreshView();

		ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
			is_initial?
			"Unset initial state"
			: "Removed transition from " + from + " to " + to.split('#')[0] + " on outcome " + outcome + ".",
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let target = container.getStateByName(to);
				if (target == undefined && container.getOutcomes().contains(to.split('#')[0])) target = container.getSMOutcomeByName(to);
				if (is_initial) {
					container.setInitialState(target);
				} else {
					container.addTransition(new Transition(container.getStateByName(from), target, outcome, autonomy));
				}
				UI.Statemachine.refreshView();
			},
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let target = container.getStateByName(to);
				if (target == undefined && container.getOutcomes().contains(to.split('#')[0])) target = container.getSMOutcomeByName(to);
				if (is_initial) {
					container.setInitialState(undefined);
				} else {
					let transition = container.getTransitions().findElement(function(trans) {
						return trans.getFrom().getStateName() == from && trans.getOutcome() == outcome;
					});
					if (transition != undefined) {
						container.removeTransitionObject(transition);
					}
				}
				UI.Statemachine.refreshView();
			}
		);

		previous_transition_end = undefined;
	}

	this.connectTransition = function(state) {
		if (!connecting) return;
		if (displayed_sm.isConcurrent()
			&& state.getStateClass() != ':CONDITION'
			&& drag_transition.getFrom().getStateName() != "INIT") {
			return;
		}
		let is_initial = drag_transition == displayed_sm.getInitialTransition();
		let has_transition = displayed_sm.hasTransition(drag_transition);
		let undo_end = previous_transition_end;
		let redo_end = state.getStateName();
		let from = drag_transition.getFrom().getStateName();
		let outcome = drag_transition.getOutcome();
		let autonomy = drag_transition.getAutonomy();
		let container_path = displayed_sm.getStatePath();

		if (undo_end == redo_end) {
			that.abortTransition();
			return;
		}

		if (!is_initial) {
			drag_transition.setTo(state);

			if (!has_transition) {
				displayed_sm.addTransition(drag_transition);
			}
			if (displayed_sm.isConcurrent()) {
				displayed_sm.tryDuplicateOutcome(state.getStateName().split('#')[0]);
			}
		} else {
			displayed_sm.setInitialState(state);
		}

		connecting = false;
		just_connected = drag_transition;
		drag_transition = undefined;
		that.refreshView();
		just_connected = undefined;
		that.refreshView();

		ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
			is_initial?
			"Set initial state to " + state.getStateName()
			: "Connected outcome " + outcome + " of " + from + " with " + state.getStateName().split('#')[0],
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let target = container.getStateByName(undo_end);
				if (target == undefined && container.getOutcomes().contains(undo_end)) target = container.getSMOutcomeByName(undo_end);
				if (is_initial) {
					container.setInitialState(target);
				} else {
					let transition = container.getTransitions().findElement(function(trans) {
						return trans.getFrom().getStateName() == from && trans.getOutcome() == outcome;
					});
					if (target != undefined) {
						transition.setTo(target);
					} else {
						transition.getFrom().unconnect(outcome);
						container.removeTransitionFrom(transition.getFrom(), outcome);
					}
				}
				UI.Statemachine.refreshView();
			},
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let target = container.getStateByName(redo_end);
				if (target == undefined && container.getOutcomes().contains(redo_end.split('#')[0])) target = container.getSMOutcomeByName(redo_end);
				if (is_initial) {
					container.setInitialState(target);
				} else {
					let transition = container.getTransitions().findElement(function(trans) {
						return trans.getFrom().getStateName() == from && trans.getOutcome() == outcome;
					});
					if (transition != undefined) {
						transition.setTo(target);
					} else {
						container.addTransition(new Transition(container.getStateByName(from), target, outcome, autonomy));
					}
				}
				UI.Statemachine.refreshView();
			}
		);

		previous_transition_end = undefined;
	}

	this.getSelectedStates = function() {
		if (selection_area.attr("opacity") == 0) return [];

		let states = displayed_sm.getStates().map(function(element) {
			return {obj: element, drawing: that.getDrawnState(element)};
		});

		let drawings = states.filter(function(element) {
			let b = element.drawing.getBBox();
			return selection_area.isPointInside(b.x, b.y)
				&& selection_area.isPointInside(b.x, b.y + b.height)
				&& selection_area.isPointInside(b.x + b.width, b.y)
				&& selection_area.isPointInside(b.x + b.width, b.y + b.height);
		});

		return drawings.map(function(element) {
			return element.obj;
		});
	}

	this.getSelectedStatesAndTransitions = function() {
		let selected_states = that.getSelectedStates();

		let selected_transitions = displayed_sm.getTransitions().filter(function(t) {
			if (t.getFrom().getStateName() == "INIT") return false;
			let from_state = selected_states.findElement(function (element) { return element.getStateName() == t.getFrom().getStateName() });
			let to_state = selected_states.findElement(function (element) { return element.getStateName() == t.getTo().getStateName() });
			return from_state != undefined && to_state != undefined;
		});

		console.log(` selected ${selected_states.length} states and ${selected_transitions.length} transitions`);
		return selected_states.concat(selected_transitions);
	}

	this.updateMergedTransitions = function(transition){
		let transitions = displayed_sm.getTransitions();
		for (let i=0; i<transitions.length; ++i) {
			let t = transitions[i];
			if (t.getTo() == undefined) continue;

			if (transition.getFrom().getStateName() == t.getFrom().getStateName() && transition.getTo().getStateName() == t.getTo().getStateName()) {
				t.setX(transition.getX());
				t.setY(transition.getY());
				t.setBeginning(transition.getBeginning());
				t.setEnd(transition.getEnd());
			}
		}
	}

	//shifts transition positions proportionately when moving states
	this.shiftTransitions = function(state, old_pos){
		let transitions = displayed_sm.getTransitions();
		let otherX;
		let otherY;
		let width;
		let height;
		let old = [];

		for (let i=0; i<transitions.length; ++i) {
			let t = transitions[i];
			let xShift = 0;
			let yShift = 0;
			if (t.getTo() == undefined || t.getFrom() == undefined)
				continue;

			temp_dict = {t: t};
			if(t.getBeginning() != undefined && t.getFrom().getStateName() == state.getStateName()){
				temp_dict.beg_x = t.getBeginning().x;
				temp_dict.beg_y = t.getBeginning().y;
				t.setBeginning({
					x: t.getBeginning().x + (state.getPosition().x-old_pos.x),
					y: t.getBeginning().y + (state.getPosition().y-old_pos.y)
				});
			}
			if(t.getEnd() != undefined && t.getTo().getStateName() == state.getStateName()){
				temp_dict.end_x = t.getEnd().x;
				temp_dict.end_y = t.getEnd().y;
				t.setEnd({
					x: t.getEnd().x + (state.getPosition().x-old_pos.x),
					y: t.getEnd().y + (state.getPosition().y-old_pos.y)
				});
			}

			if(t.getX() != undefined){
				if (t.getTo().getStateName() == state.getStateName()){
					temp_dict.x = t.getX();
					temp_dict.y = t.getY();
					otherX = t.getFrom().getPosition().x;
					otherY = t.getFrom().getPosition().y;
					width = Math.abs(old_pos.x - otherX);
					height = Math.abs(old_pos.y - otherY);
					xShift = Math.abs(t.getX()-otherX)/width * (state.getPosition().x-old_pos.x);
					yShift = Math.abs(t.getY()-otherY)/height * (state.getPosition().y-old_pos.y);
				}else if(t.getFrom().getStateName() == state.getStateName()){
					temp_dict.x = t.getX();
					temp_dict.y = t.getY();
					otherX = t.getTo().getPosition().x;
					otherY = t.getTo().getPosition().y;
					width = Math.abs(old_pos.x - otherX);
					height = Math.abs(old_pos.y - otherY);
					xShift = Math.abs(t.getX()-otherX)/width * (state.getPosition().x-old_pos.x);
					yShift = Math.abs(t.getY()-otherY)/height * (state.getPosition().y-old_pos.y);
				}

				if(t.getX() > old_pos.x && t.getX() > otherX && state.getPosition().x >= old_pos.x){
					xShift = 0;
				}
				else if(t.getX() < old_pos.x && t.getX() < otherX && state.getPosition().x <= old_pos.x){
					xShift = 0;
				}
				if(t.getY() > old_pos.y && t.getY() > otherY && state.getPosition().y >= old_pos.y){
					yShift = 0;
				}
				else if (t.getY() < old_pos.y && t.getY() < otherY && state.getPosition().y <= old_pos.y){
					yShift = 0;
				}
				let xNew = t.getX() + xShift;
				let yNew = t.getY() + yShift;
				if (xNew < 10) {
					console.log(`\x1b[91m  ${state.getStateName()} - shift transition '${t.getOutcome()}' : limit x label position (${xNew}, ${yNew})\x1b[0m`);
					xNew = 10;
				}
				if (yNew < 10) {
					console.log(`\x1b[91m  ${state.getStateName()} - shift transition '${t.getOutcome()}' : limit y label position (${xNew}, ${yNew})\x1b[0m`);
					yNew = 10;
				}

				t.setX(xNew);
				t.setY(yNew);
			}

			if(Object.keys(temp_dict).length > 1){
				old.push(temp_dict);
			}
		}
		return old;

	}

	this.undoShiftTransitions = function(transitions){
		for (let i=0; i<transitions.length; ++i) {
			let temp = transitions[i];
			if("x" in temp){
				temp.t.setX(temp.x);
				temp.t.setY(temp.y);
			}
			if("beg_x" in temp){
				temp.t.setBeginning({
					x: temp.beg_x,
					y: temp.beg_y
				});
			}
			if("end_x" in temp){
				temp.t.setEnd({
					x: temp.end_x,
					y: temp.end_y
				});
			}
		}
	}

	this.setupTabHandling = function() {
		// Set focus on the main panel to capture key presses
		document.getElementById("statemachine").focus({preventScroll: true});
	}


	// Define the event listener function
	this.handleKeyDown = function(event) {
		if (event.key === "Tab") {
			// RC is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			UI.Panels.setFocus();
			UI.Panels.handleKeyDown(event);
		} else if (event.target.id === 'statemachine') {
			// SM view is active so capture all keys
			event.preventDefault(); // Prevent the default action
		}
	}

	this.handleKeyUp = function(event) {
		if (event.key === "Tab") {
			// Statemachine editor is active so capture all the TABS
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
		}
		// else if (event.target.id === 'statemachine') {
		// 	// SM view is active so capture all keys
		// 	console.log(`\x1b[93mStatemachine view saw keyup for other keys '${event.key}' ('${event.target.id}') - no preventDefault but allow propagation!\x1b[0m`);
		// 	//event.preventDefault(); // Prevent the default action
		// }
	}
}) ();
