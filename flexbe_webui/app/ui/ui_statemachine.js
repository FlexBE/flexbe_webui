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
	var connect_refresh_pending = false;
	var just_connected;
	var selecting = false;
	var allow_panning = false;
	var panning = false;
	var mouse_pos = undefined;
	var background = undefined;
	var dataflow_displayed = false;
	var comments_displayed = true;
	var outcomes_displayed = true;
	var zoom_fit_active = false;
	var zoom_fit_previous_pan = undefined;
	var fit_view_overlay = undefined;
	var fit_pan_indicator = undefined;
	var render_config = {
		gridsize: 50,
		text_scale: 1.0,
		text_weight: 400,
		transition_line_width_normal: 2.0,
		transition_line_width_bold: 3.0,
		transition_line_width_extra_bold: 4.0,
	};

	var drawn_sms = [];
	var grid = [];
	var state_drawings_map = new Map();

	var tab_targets = [];

	var updateRenderConfig = function() {
		let gridsize = 50;
		let text_scale = 1.0;
		let text_weight = 400;
		let transition_line_width_normal = 2.0;
		let transition_line_width_bold = 3.0;
		let transition_line_width_extra_bold = 4.0;

		try {
			if (UI.Settings != undefined) {
				if (UI.Settings.getGridsize) {
					gridsize = parseInt(UI.Settings.getGridsize());
				}
				if (UI.Settings.getStatemachineTextSize) {
					const text_size = parseFloat(UI.Settings.getStatemachineTextSize());
					if (isFinite(text_size) && text_size > 0) {
						text_scale = text_size / 86.5;
					}
				}
				if (UI.Settings.isStatemachineTextExtraBold && UI.Settings.isStatemachineTextExtraBold()) {
					text_weight = 900;
				} else if (UI.Settings.isStatemachineTextBold && UI.Settings.isStatemachineTextBold()) {
					text_weight = 700;
				}
				if (UI.Settings.getTransitionLineWidthNormal) {
					transition_line_width_normal = parseFloat(UI.Settings.getTransitionLineWidthNormal());
				}
				if (UI.Settings.getTransitionLineWidthBold) {
					transition_line_width_bold = parseFloat(UI.Settings.getTransitionLineWidthBold());
				}
				if (UI.Settings.getTransitionLineWidthExtraBold) {
					transition_line_width_extra_bold = parseFloat(UI.Settings.getTransitionLineWidthExtraBold());
				}
			}
		} catch (err) {
			// Fall back to defaults when settings are unavailable.
		}

		if (!isFinite(gridsize) || gridsize <= 0) {
			gridsize = 50;
		}
		if (!isFinite(text_scale) || text_scale <= 0) {
			text_scale = 1.0;
		}
		if (!isFinite(transition_line_width_normal) || transition_line_width_normal <= 0) {
			transition_line_width_normal = 2.0;
		}
		if (!isFinite(transition_line_width_bold) || transition_line_width_bold <= 0) {
			transition_line_width_bold = 3.0;
		}
		if (!isFinite(transition_line_width_extra_bold) || transition_line_width_extra_bold <= 0) {
			transition_line_width_extra_bold = 4.0;
		}

		render_config = {
			gridsize: gridsize,
			text_scale: Math.min(Math.max(text_scale, 0.6), 2.0),
			text_weight: text_weight,
			transition_line_width_normal: transition_line_width_normal,
			transition_line_width_bold: transition_line_width_bold,
			transition_line_width_extra_bold: transition_line_width_extra_bold,
		};
	}

	Mousetrap.bind("shift", function() {
		if (zoom_fit_active) return;
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

	var statemachineShortcutsActive = function() {
		try {
			return UI.Menu == undefined
				|| UI.Menu.isPageStatemachine == undefined
				|| UI.Menu.isPageStatemachine();
		} catch (err) {
			return true;
		}
	}

	var runStatemachineShortcut = function(callback) {
		if (!statemachineShortcutsActive()) {
			return;
		}
		callback();
	}

	var runRegularViewShortcut = function(callback) {
		if (!statemachineShortcutsActive()) {
			return;
		}
		if (zoom_fit_active) {
			that.disableFitView();
		}
		callback();
	}

	Mousetrap.bind("shift+space", function() {
		runStatemachineShortcut(that.panToHome);
	});

	Mousetrap.bind("ctrl+0", function(evt) {
		if (!statemachineShortcutsActive()) {
			return;
		}
		if (evt && evt.preventDefault) evt.preventDefault();
		that.toggleFitView();
	});

	Mousetrap.bind("home", function() {
		runRegularViewShortcut(that.panToHome);
	});

	Mousetrap.bind("ctrl+home", function() {
		runRegularViewShortcut(that.panToHome);
	});

	Mousetrap.bind("shift+home", function() {
		runRegularViewShortcut(that.panToHome);
	});

	Mousetrap.bind("end", function() {
		runRegularViewShortcut(that.panToCanvasExtents);
	});

	Mousetrap.bind("ctrl+end", function() {
		runRegularViewShortcut(that.panToCanvasExtents);
	});

	Mousetrap.bind("shift+end", function() {
		runRegularViewShortcut(that.panToCanvasExtents);
	});

	Mousetrap.bind("shift+left", function() {
		runRegularViewShortcut(function() { panShift(that.getGridSize(), 0); });
	});
	Mousetrap.bind("shift+right", function() {
		runRegularViewShortcut(function() { panShift(-that.getGridSize(), 0); });
	});
	Mousetrap.bind("shift+up", function() {
		runRegularViewShortcut(function() { panShift(0, that.getGridSize()); });
	});
	Mousetrap.bind("shift+down", function() {
		runRegularViewShortcut(function() { panShift(0, -that.getGridSize()); });
	});

	var panShift = function(dx, dy, force) {
		let show_pan_feedback = allow_panning || panning;
		if (zoom_fit_active && !force) {
			return;
		}
		if (!allow_panning && !force) {
			T.logInfo(`    Panning is not allowed in this configuration!`);
			return;
		}
		hideGrid();
		pan_shift.x += dx;
		pan_shift.y += dy;
		if (pan_shift.x > 0 ) {
			dx =  dx - pan_shift.x
			// console.log(`Limit pan shift! (${dx}, ${dy}) current pan(${pan_shift.x}, ${pan_shift.y})`);
			pan_shift.x = 0;
		}
		if (pan_shift.y > 0 ) {
			dy = dy - pan_shift.y;
			// console.log(`Limit pan shift! (${dx}, ${dy}) current pan(${pan_shift.x}, ${pan_shift.y})`);
			pan_shift.y = 0;
		}
		drawings.forEach(function(entry) {
			if (entry.obj instanceof State && entry.obj.getStateClass() == ':CONTAINER') return;
			let d = entry.drawing;
			d.translate(dx, dy);
		});
		// console.log(`Pan shifted: dx, dy=(${dx}, ${dy})  pan shift=(${pan_shift.x}, ${pan_shift.y}).`)

		if (!panning && show_pan_feedback) displayGrid();
	}

	var setPanShift = function(target) {
		panShift(-pan_shift.x + target.x, -pan_shift.y + target.y, true);
	}

	this.panToHome = function() {
		panShift(-pan_shift.x, -pan_shift.y, true);
	}

	this.panToCanvasExtents = function() {
		if (sm_extents == undefined || R == undefined) {
			return;
		}
		let xc = sm_extents.x - R.width;
		let yc = sm_extents.y - R.height;
		if (xc < 0) xc = 0;
		if (yc < 0) yc = 0;
		panShift(-pan_shift.x - xc, -pan_shift.y - yc, true);
	}

	var createFitViewOverlay = function() {
		let parent = document.getElementById("statemachine");
		if (parent == undefined) return;
		fit_view_overlay = document.getElementById("fit_view_overlay");
		if (fit_view_overlay == undefined) {
			fit_view_overlay = document.createElement("div");
			fit_view_overlay.setAttribute("id", "fit_view_overlay");
			fit_view_overlay.textContent = "Fit View - read-only - click to focus - Ctrl+0 to exit";
			parent.appendChild(fit_view_overlay);
		}
		fit_view_overlay.style.display = "none";
	}

	var updateFitViewOverlay = function() {
		if (fit_view_overlay == undefined) return;
		fit_view_overlay.style.display = zoom_fit_active ? "block" : "none";
	}

	var getCanvasViewBox = function() {
		if (R == undefined || R.canvas == undefined || R.canvas.getAttribute == undefined) {
			return {x: 0, y: 0, width: R ? R.width : 0, height: R ? R.height : 0};
		}
		let value = R.canvas.getAttribute("viewBox");
		if (value == undefined || value === "") {
			return {x: 0, y: 0, width: R.width, height: R.height};
		}
		let parts = value.trim().split(/\s+/).map(parseFloat);
		if (parts.length != 4 || parts.some(function(part) { return !isFinite(part); })) {
			return {x: 0, y: 0, width: R.width, height: R.height};
		}
		return {x: parts[0], y: parts[1], width: parts[2], height: parts[3]};
	}

	var clientToSVGPoint = function(event) {
		if (R == undefined || R.canvas == undefined) {
			return {x: event.offsetX || 0, y: event.offsetY || 0};
		}
		if (R.canvas.createSVGPoint && R.canvas.getScreenCTM) {
			let matrix = R.canvas.getScreenCTM();
			if (matrix != undefined && matrix.inverse != undefined && event.clientX != undefined && event.clientY != undefined) {
				let pt = R.canvas.createSVGPoint();
				pt.x = event.clientX;
				pt.y = event.clientY;
				return pt.matrixTransform(matrix.inverse());
			}
		}
		let rect = R.canvas.getBoundingClientRect ? R.canvas.getBoundingClientRect() : {left: 0, top: 0, width: R.width, height: R.height};
		let viewBox = getCanvasViewBox();
		let local_x = event.offsetX;
		let local_y = event.offsetY;
		if (local_x == undefined || local_y == undefined) {
			local_x = (event.clientX == undefined ? 0 : event.clientX - rect.left);
			local_y = (event.clientY == undefined ? 0 : event.clientY - rect.top);
		}
		let rect_width = rect.width || R.width;
		let rect_height = rect.height || R.height;
		return {
			x: viewBox.x + local_x / rect_width * viewBox.width,
			y: viewBox.y + local_y / rect_height * viewBox.height
		};
	}

	var computeFitBounds = function() {
		let bounds = undefined;
		drawings.forEach(function(entry) {
			if (entry == undefined || entry.drawing == undefined || entry.drawing.getBBox == undefined) return;
			let b;
			try {
				b = entry.drawing.getBBox();
			} catch (err) {
				return;
			}
			if (b == undefined || !isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height)) return;
			let x2 = isFinite(b.x2) ? b.x2 : b.x + b.width;
			let y2 = isFinite(b.y2) ? b.y2 : b.y + b.height;
			if (bounds == undefined) {
				bounds = {x: b.x, y: b.y, x2: x2, y2: y2};
			} else {
				bounds.x = Math.min(bounds.x, b.x);
				bounds.y = Math.min(bounds.y, b.y);
				bounds.x2 = Math.max(bounds.x2, x2);
				bounds.y2 = Math.max(bounds.y2, y2);
			}
		});
		if (bounds == undefined) {
			bounds = {x: 0, y: 0, x2: R.width, y2: R.height};
		}
		let margin = that.getGridSize();
		bounds.x = Math.max(0, bounds.x - margin);
		bounds.y = Math.max(0, bounds.y - margin);
		bounds.x2 += margin;
		bounds.y2 += margin;
		bounds.width = Math.max(1, bounds.x2 - bounds.x);
		bounds.height = Math.max(1, bounds.y2 - bounds.y);
		return bounds;
	}

	var updateCanvasExtentsFromDrawings = function() {
		if (R == undefined) return;
		let bounds = undefined;
		drawings.forEach(function(entry) {
			if (entry == undefined || entry.drawing == undefined || entry.drawing.getBBox == undefined) return;
			if (entry.obj instanceof State && entry.obj.getStateClass() == ':CONTAINER') return;
			let b;
			try {
				b = entry.drawing.getBBox();
			} catch (err) {
				return;
			}
			if (b == undefined || !isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height)) return;
			let x2 = isFinite(b.x2) ? b.x2 : b.x + b.width;
			let y2 = isFinite(b.y2) ? b.y2 : b.y + b.height;
			if (bounds == undefined) {
				bounds = {x2: x2, y2: y2};
			} else {
				bounds.x2 = Math.max(bounds.x2, x2);
				bounds.y2 = Math.max(bounds.y2, y2);
			}
		});
		if (bounds == undefined) return;
		let padding = that.getGridSize();
		sm_extents.x = Math.max(sm_extents.x, Math.ceil(bounds.x2 + padding), R.width);
		sm_extents.y = Math.max(sm_extents.y, Math.ceil(bounds.y2 + padding), R.height);
	}

	var applyFitViewBox = function() {
		if (R == undefined || R.canvas == undefined || R.canvas.setAttribute == undefined) return;
		let bounds = computeFitBounds();
		let scale = Math.min(R.width / bounds.width, R.height / bounds.height, 1.0);
		if (!isFinite(scale) || scale <= 0) scale = 1.0;
		let view_w = R.width / scale;
		let view_h = R.height / scale;
		let center_x = bounds.x + bounds.width / 2;
		let center_y = bounds.y + bounds.height / 2;
		let view_x = Math.max(0, center_x - view_w / 2);
		let view_y = Math.max(0, center_y - view_h / 2);
		R.canvas.setAttribute("viewBox", view_x + " " + view_y + " " + view_w + " " + view_h);
		if (fit_pan_indicator != undefined) {
			let ix = zoom_fit_previous_pan ? -zoom_fit_previous_pan.x : 0;
			let iy = zoom_fit_previous_pan ? -zoom_fit_previous_pan.y : 0;
			fit_pan_indicator.attr({x: ix, y: iy, width: R.width, height: R.height, opacity: 1});
		}
	}

	var clearFitViewBox = function() {
		if (R == undefined || R.canvas == undefined) return;
		if (R.canvas.removeAttribute) {
			R.canvas.removeAttribute("viewBox");
		} else if (R.canvas.setAttribute) {
			R.canvas.setAttribute("viewBox", "0 0 " + R.width + " " + R.height);
		}
		if (fit_pan_indicator != undefined) {
			fit_pan_indicator.attr({x: 0, y: 0, width: 0, height: 0, opacity: 0});
		}
	}

	var clampPanToFitBounds = function(target_pan) {
		if (target_pan == undefined || R == undefined) return target_pan;
		let bounds = computeFitBounds();
		let min_x = Math.min(-bounds.x, R.width - bounds.x2);
		let max_x = Math.max(-bounds.x, R.width - bounds.x2);
		let min_y = Math.min(-bounds.y, R.height - bounds.y2);
		let max_y = Math.max(-bounds.y, R.height - bounds.y2);
		return {
			x: Math.min(max_x, Math.max(min_x, target_pan.x)),
			y: Math.min(max_y, Math.max(min_y, target_pan.y))
		};
	}

	this.enableFitView = function() {
		if (zoom_fit_active || R == undefined) return;
		if (connecting) {
			T.logInfo("Finish or abort the active transition before entering Fit View.");
			return;
		}
		zoom_fit_previous_pan = {x: pan_shift.x, y: pan_shift.y};
		that.removeSelection();
		that.panToHome();
		zoom_fit_active = true;
		hideGrid();
		updateFitViewOverlay();
		if (displayed_sm != undefined) {
			that.refreshView();
		} else {
			applyFitViewBox();
		}
		T.logInfo("Fit View enabled: editing is disabled until you return to actual size.");
	}

	this.disableFitView = function(focus_point) {
		if (!zoom_fit_active) return;
		zoom_fit_active = false;
		clearFitViewBox();
		updateFitViewOverlay();
		let target_pan = zoom_fit_previous_pan || {x: 0, y: 0};
		if (focus_point != undefined && isFinite(focus_point.x) && isFinite(focus_point.y)) {
			target_pan = {
				x: Math.min(0, Math.round(R.width / 2 - focus_point.x)),
				y: Math.min(0, Math.round(R.height / 2 - focus_point.y))
			};
		}
		target_pan = clampPanToFitBounds(target_pan);
		setPanShift(target_pan);
		zoom_fit_previous_pan = undefined;
		if (displayed_sm != undefined) {
			that.refreshView();
		}
		T.logInfo("Fit View disabled: editing restored.");
	}

	this.toggleFitView = function() {
		if (zoom_fit_active) {
			that.disableFitView();
		} else {
			that.enableFitView();
		}
	}

	this.isFitView = function() {
		return zoom_fit_active;
	}

	var handleFitViewClick = function(event) {
		if (!zoom_fit_active) return;
		if (event.preventDefault) event.preventDefault();
		if (event.stopPropagation) event.stopPropagation();
		if (event.stopImmediatePropagation) event.stopImmediatePropagation();
		let focus_point = clientToSVGPoint(event);
		that.disableFitView(focus_point);
	}

	var updateMousePos = function(event) {
		let p = clientToSVGPoint(event);
		mouse_pos.attr({ cx: p.x, cy: p.y });
		if (connecting) {
			if (connect_refresh_pending) return;
			connect_refresh_pending = true;
			let scheduleRefresh = window.requestAnimationFrame || function(callback) {
				setTimeout(callback, 0);
			};
			scheduleRefresh(function() {
				connect_refresh_pending = false;
				if (connecting) that.refreshView();
			});
		}
	}

	var createGrid = function() {
		if (grid.length > 0) return;
		let gridsize = that.getGridSize();
		let makeGridLine = function(path) {
			return R.path(path).attr({stroke: '#ddd', 'pointer-events': 'none'}).hide();
		}
		for (let i = 0; i <= R.width + gridsize; i += gridsize) {
			grid.push(makeGridLine("M" + i + ",0L" + i + "," + (R.height + gridsize)));
		}
		for (let i = 0; i <= R.height + gridsize; i += gridsize) {
			grid.push(makeGridLine("M0," + i + "L" + (R.width + gridsize) + "," + i));
		}
	}
	var displayGrid = function() {
		createGrid();
		let gridsize = that.getGridSize();
		let ox = UI.Statemachine.getPanShift().x % gridsize;
		let oy = UI.Statemachine.getPanShift().y % gridsize;
		grid.forEach(function(el) { el.transform("t" + ox + "," + oy).show(); });
	}
	var hideGrid = function() {
		grid.forEach(function(el) { el.hide(); });
	}

	var beginSelection = function(x, y, event) {
		if (zoom_fit_active) return;
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
			// console.log(`Selected ${JSON.stringify(state_names)}`);
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
		drag_indicator = R.rect(0,0,1,1).attr({opacity: 0});
		selection_area = R.rect(0,0,0,0).attr({
			opacity: 0,
			stroke: "#000", 'stroke-dasharray': "--",
			fill: "rgba(250,250,250,0.4)",
			'stroke-width': 0.5,
			cursor: "pointer"})
			.drag(updateSelectionMove, beginSelectionMove, endSelectionMove);

		mouse_pos = R.circle(0, 0, 2).attr({opacity: 0, 'pointer-events': 'none'});

		background = R.rect(0, 0, R.width, R.height)
			.attr({fill: '#FFF', stroke: '#FFF'}).toBack()
			.mousemove(updateMousePos)
			.drag(updateSelection, beginSelection, endSelection)
			.click(function() { document.activeElement.blur(); });
		fit_pan_indicator = R.rect(0, 0, 0, 0)
			.attr({fill: '#fff', stroke: '#cfd6df', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none'});
		sm_extents = {x: R.width, y: R.height};
		createFitViewOverlay();
		if (R.canvas != undefined && R.canvas.addEventListener != undefined) {
			R.canvas.addEventListener("click", handleFitViewClick, true);
		}
		updateFitViewOverlay();
	}


	this.initialize = function() {
		grid = [];
		state_drawings_map = new Map();
		initializeDrawingArea();
		updateRenderConfig();

		displayed_sm = Behavior.getStatemachine();
	}

	this.recreateDrawingArea = function() {
		zoom_fit_active = false;
		zoom_fit_previous_pan = undefined;
		// clear
		for (let i=0; i<drawings.length; ++i) {
			drawings[i].drawing.remove();
		}
		drawings = [];
		grid = [];
		state_drawings_map = new Map();

		if (R != undefined) {
			R.remove();
		}

		initializeDrawingArea();
		updateRenderConfig();
		that.refreshView();
	}

	this.updateRenderConfig = function() {
		updateRenderConfig();
	}

	this.getRenderConfig = function() {
		return Object.assign({}, render_config);
	}

	this.getGridSize = function() {
		return render_config.gridsize;
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
		if (zoom_fit_active) {
			zoom_fit_active = false;
			clearFitViewBox();
			updateFitViewOverlay();
			zoom_fit_previous_pan = undefined;
		}
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
		return zoom_fit_active
			|| displayed_sm == undefined
			|| RC.Controller.isReadonly()
			|| displayed_sm.isInsideDifferentBehavior()
			|| Behavior.isReadonly();
	}

	var getTransitionKey = function(transition) {
		return transition.getFrom().getStateName() + "::" + transition.getOutcome();
	}

	var getSnapshotTransitionKey = function(entry) {
		if (entry.key != undefined) {
			return entry.key;
		}
		if (entry.from_state_name != undefined && entry.outcome != undefined) {
			return entry.from_state_name + "::" + entry.outcome;
		}
		return undefined;
	}

	var getLayoutBox = function(state) {
		let drawing = state_drawings_map.get(state.getStateName());
		if (drawing == undefined || drawing.getBBox == undefined) {
			return undefined;
		}
		let bbox = drawing.getBBox();
		let box_x = bbox.x - pan_shift.x;
		let box_y = bbox.y - pan_shift.y;
		return {
			x: box_x,
			y: box_y,
			width: bbox.width,
			height: bbox.height,
			cx: box_x + bbox.width / 2,
			cy: box_y + bbox.height / 2
		};
	}

	var getPortSideAxis = function(side) {
		return (side == "top" || side == "bottom") ? "x" : "y";
	}

	var getAutoLayoutPortSides = function(source_box, target_box) {
		let dx = target_box.cx - source_box.cx;
		let dy = target_box.cy - source_box.cy;
		let same_column_threshold = (source_box.width + target_box.width) / 4;
		if (Math.abs(dx) > same_column_threshold) {
			return dx > 0 ? ["right", "left"] : ["left", "right"];
		}
		return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
	}

	var getPortPoint = function(box, side, index, count) {
		let fraction = (index + 1) / (Math.max(count, 1) + 1);
		if (side == "left") {
			return {x: box.x, y: box.y + box.height * fraction};
		}
		if (side == "right") {
			return {x: box.x + box.width, y: box.y + box.height * fraction};
		}
		if (side == "top") {
			return {x: box.x + box.width * fraction, y: box.y};
		}
		return {x: box.x + box.width * fraction, y: box.y + box.height};
	}

	var getAutoLayoutWaypoint = function(beginning, end, source_side, target_side, index, count) {
		let midpoint = {
			x: (beginning.x + end.x) / 2,
			y: (beginning.y + end.y) / 2
		};
		let lane_offset = (index - (count - 1) / 2) * 6;
		let arc_offset = Math.max(60, Math.min(180, Math.abs(beginning.y - end.y) * 0.12 + 70));
		if (target_side == "left") {
			return {x: Math.min(midpoint.x - 40, end.x - arc_offset), y: midpoint.y + lane_offset};
		}
		if (target_side == "right") {
			return {x: Math.max(midpoint.x + 40, end.x + arc_offset), y: midpoint.y + lane_offset};
		}
		arc_offset = Math.max(60, Math.min(180, Math.abs(beginning.x - end.x) * 0.12 + 70));
		if (target_side == "top") {
			return {x: midpoint.x + lane_offset, y: Math.min(midpoint.y - 40, end.y - arc_offset)};
		}
		return {x: midpoint.x + lane_offset, y: Math.max(midpoint.y + 40, end.y + arc_offset)};
	}

	var buildDrawnTransitionGeometry = function(container) {
		let edge_entries = [];
		let entries_by_pair = new Map();
		let outgoing_groups = new Map();
		let incoming_groups = new Map();

		let addToGroup = function(groups, key, entry) {
			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key).push(entry);
		}

		container.getTransitions().forEach(function(transition, order) {
			if (transition.getTo() == undefined || transition.getFrom().getStateName() == "INIT") {
				return;
			}
			let pair_key = transition.getFrom().getStateName() + "\0" + transition.getTo().getStateName();
			let existing_entry = entries_by_pair.get(pair_key);
			if (existing_entry != undefined) {
				existing_entry.transitions.push(transition);
				return;
			}
			let source_box = getLayoutBox(transition.getFrom());
			let target_box = getLayoutBox(transition.getTo());
			if (source_box == undefined || target_box == undefined) {
				return;
			}
			let sides = getAutoLayoutPortSides(source_box, target_box);
			let entry = {
				transition: transition,
				transitions: [transition],
				order: order,
				source_box: source_box,
				target_box: target_box,
				source_side: sides[0],
				target_side: sides[1]
			};
			entries_by_pair.set(pair_key, entry);
			edge_entries.push(entry);
			addToGroup(outgoing_groups, transition.getFrom().getStateName() + "\0" + entry.source_side, entry);
			addToGroup(incoming_groups, transition.getTo().getStateName() + "\0" + entry.target_side, entry);
		});

		outgoing_groups.forEach(function(entries) {
			let axis = getPortSideAxis(entries[0].source_side);
			entries.sort(function(a, b) {
				let delta = a.target_box["c" + axis] - b.target_box["c" + axis];
				if (delta != 0) return delta;
				return a.order - b.order;
			});
			entries.forEach(function(entry, index) {
				entry.beginning = getPortPoint(entry.source_box, entry.source_side, index, entries.length);
			});
		});

		incoming_groups.forEach(function(entries) {
			let axis = getPortSideAxis(entries[0].target_side);
			entries.sort(function(a, b) {
				let delta = a.source_box["c" + axis] - b.source_box["c" + axis];
				if (delta != 0) return delta;
				return a.order - b.order;
			});
			entries.forEach(function(entry, index) {
				entry.incoming_index = index;
				entry.incoming_count = entries.length;
				entry.end = getPortPoint(entry.target_box, entry.target_side, index, entries.length);
			});
		});

		let geometry = [];
		edge_entries.sort(function(a, b) { return a.order - b.order; }).forEach(function(entry) {
			let waypoint = getAutoLayoutWaypoint(
				entry.beginning,
				entry.end,
				entry.source_side,
				entry.target_side,
				entry.incoming_index || 0,
				entry.incoming_count || 1
			);
			entry.transitions.forEach(function(transition) {
				geometry.push({
					key: getTransitionKey(transition),
					x: Math.round(waypoint.x),
					y: Math.round(waypoint.y),
					beginning: {
						x: Math.round(entry.beginning.x),
						y: Math.round(entry.beginning.y)
					},
					end: {
						x: Math.round(entry.end.x),
						y: Math.round(entry.end.y)
					}
				});
			});
		});
		return geometry;
	}

	var createLayoutNodePayload = function(state) {
		return {
			state_name: state.getStateName(),
			state_class: state.getStateClass(),
			position_x: state.getPosition().x,
			position_y: state.getPosition().y
		};
	}

	var buildAutoLayoutRequest = function(container) {
		return {
			container_name: container.getStateName(),
			initial_state_name: container.getInitialState() ? container.getInitialState().getStateName() : null,
			concurrent: container.isConcurrent(),
			priority: container.isPriority(),
			states: container.getStates().map(createLayoutNodePayload),
			outcomes: container.getSMOutcomes().map(createLayoutNodePayload),
			transitions: container.getTransitions().filter(function(transition) {
				return transition.getTo() != undefined && transition.getFrom().getStateName() != "INIT";
			}).map(function(transition) {
				return {
					from_state_name: transition.getFrom().getStateName(),
					to_state_name: transition.getTo().getStateName(),
					outcome: transition.getOutcome()
				};
			})
		};
	}

	var captureLayoutSnapshot = function(container) {
		return {
			states: container.getStates().map(function(state) {
				return {
					state_name: state.getStateName(),
					position_x: state.getPosition().x,
					position_y: state.getPosition().y
				};
			}),
			outcomes: container.getSMOutcomes().map(function(state) {
				return {
					state_name: state.getStateName(),
					position_x: state.getPosition().x,
					position_y: state.getPosition().y
				};
			}),
			transitions: container.getTransitions().map(function(transition) {
				return {
					key: getTransitionKey(transition),
					x: transition.getX(),
					y: transition.getY(),
					beginning: transition.getBeginning() == undefined ? undefined : {
						x: transition.getBeginning().x,
						y: transition.getBeginning().y
					},
					end: transition.getEnd() == undefined ? undefined : {
						x: transition.getEnd().x,
						y: transition.getEnd().y
					}
				};
			})
		};
	}

	var applyLayoutSnapshot = function(container, snapshot) {
		(snapshot.states || []).forEach(function(entry) {
			let state = container.getStateByName(entry.state_name);
			if (state != undefined) {
				state.setPosition({x: entry.position_x, y: entry.position_y});
			}
		});
		(snapshot.outcomes || []).forEach(function(entry) {
			let outcome = container.getSMOutcomeByName(entry.state_name);
			if (outcome != undefined && outcome.getStateName() == entry.state_name) {
				outcome.setPosition({x: entry.position_x, y: entry.position_y});
			}
		});

		let transitions_by_key = new Map();
		(snapshot.transitions || []).forEach(function(entry) {
			let key = getSnapshotTransitionKey(entry);
			if (key != undefined) {
				transitions_by_key.set(key, entry);
			}
		});
		container.getTransitions().forEach(function(transition) {
			let geometry = transitions_by_key.get(getTransitionKey(transition));
			if (geometry == undefined) {
				transition.setX(undefined);
				transition.setY(undefined);
				transition.setBeginning(undefined);
				transition.setEnd(undefined);
				return;
			}
			transition.setX(geometry.x);
			transition.setY(geometry.y);
			transition.setBeginning(geometry.beginning == undefined ? undefined : {
				x: geometry.beginning.x,
				y: geometry.beginning.y
			});
			transition.setEnd(geometry.end == undefined ? undefined : {
				x: geometry.end.x,
				y: geometry.end.y
			});
		});
	}

	var clearTransitionGeometry = function(container) {
		container.getTransitions().forEach(function(transition) {
			transition.setX(undefined);
			transition.setY(undefined);
			transition.setBeginning(undefined);
			transition.setEnd(undefined);
		});
	}

	var captureTreeSnapshot = function(sm) {
		return {
			snapshot: captureLayoutSnapshot(sm),
			children: sm.getStates()
				.filter(function(s) { return typeof s.getStates === 'function'; })
				.map(function(s) { return {name: s.getStateName(), tree: captureTreeSnapshot(s)}; })
		};
	}

	var applyTreeSnapshot = function(sm, tree) {
		applyLayoutSnapshot(sm, tree.snapshot);
		tree.children.forEach(function(child) {
			let state = sm.getStateByName(child.name);
			if (state != undefined) applyTreeSnapshot(state, child.tree);
		});
	}

	var rescaleSMPositions = function(sm, ratio) {
		sm.getStates().forEach(function(state) {
			let pos = state.getPosition();
			state.setPosition({x: Math.round(pos.x * ratio), y: Math.round(pos.y * ratio)});
			if (typeof state.getStates === 'function') rescaleSMPositions(state, ratio);
		});
		sm.getSMOutcomes().forEach(function(outcome) {
			let pos = outcome.getPosition();
			outcome.setPosition({x: Math.round(pos.x * ratio), y: Math.round(pos.y * ratio)});
		});
		sm.getTransitions().forEach(function(transition) {
			if (transition.getX() != undefined) transition.setX(Math.round(transition.getX() * ratio));
			if (transition.getY() != undefined) transition.setY(Math.round(transition.getY() * ratio));
			transition.setBeginning(undefined);
			transition.setEnd(undefined);
		});
	}

	this.rescaleAllPositions = function(ratio) {
		if (!isFinite(ratio) || ratio <= 0 || ratio === 1) return;
		let root = Behavior.getStatemachine ? Behavior.getStatemachine() : undefined;
		if (root == undefined) return;
		let previous = captureTreeSnapshot(root);
		rescaleSMPositions(root, ratio);
		let next = captureTreeSnapshot(root);
		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Rescaled layout positions for text size change",
			function() { applyTreeSnapshot(root, previous); UI.Statemachine.refreshView(); },
			function() { applyTreeSnapshot(root, next); UI.Statemachine.refreshView(); }
		);
	}

	var snapshotsEqual = function(left, right) {
		return JSON.stringify(left) == JSON.stringify(right);
	}

	var finishAutoLayout = function(container, previous_snapshot, success_message) {
		let next_snapshot = captureLayoutSnapshot(container);
		that.refreshView();

		if (snapshotsEqual(previous_snapshot, next_snapshot)) {
			T.logInfo("Auto layout left the active container unchanged.");
			return;
		}

		let container_name = container.getStateName();
		ActivityTracer.addActivity(ActivityTracer.ACT_COMPLEX_OPERATION,
			"Applied auto layout to " + container_name,
			function() {
				applyLayoutSnapshot(container, previous_snapshot);
				UI.Statemachine.refreshView();
			},
			function() {
				applyLayoutSnapshot(container, next_snapshot);
				UI.Statemachine.refreshView();
			}
		);
		T.logInfo(success_message);
	}

	this.updateTransitionGeometry = function(container) {
		if (container == undefined) {
			container = displayed_sm;
		}
		if (container == undefined) {
			return false;
		}

		let previous_displayed = displayed_sm;
		let previous_pan = {x: pan_shift.x, y: pan_shift.y};
		let restoring_view = previous_displayed != container;

		displayed_sm = container;
		if (restoring_view) {
			pan_shift = {x: 0, y: 0};
		}
		that.refreshView();

		let drawn_transition_geometry = buildDrawnTransitionGeometry(container);
		if (drawn_transition_geometry.length == 0) {
			if (restoring_view) {
				displayed_sm = previous_displayed;
				pan_shift = previous_pan;
				that.refreshView();
			}
			return false;
		}

		applyLayoutSnapshot(container, {
			states: [],
			outcomes: [],
			transitions: drawn_transition_geometry
		});

		if (restoring_view) {
			displayed_sm = previous_displayed;
			pan_shift = previous_pan;
		}
		that.refreshView();
		return true;
	}

	this.requestAutoLayout = async function() {
		if (displayed_sm == undefined || that.isReadonly()) return;

		let container = displayed_sm;
		let previous_snapshot = captureLayoutSnapshot(container);
		try {
			const {data} = await API.postDataAsync('statemachine/auto_layout', buildAutoLayoutRequest(container));
			applyLayoutSnapshot(container, {
				states: data.states || [],
				outcomes: data.outcomes || [],
				transitions: []
			});
			if (!that.updateTransitionGeometry(container) && (data.transitions || []).length > 0) {
				applyLayoutSnapshot(container, {
					states: [],
					outcomes: [],
					transitions: data.transitions || []
				});
			}
			finishAutoLayout(container, previous_snapshot, "Applied auto layout to '" + container.getStateName() + "'.");
		} catch (exc) {
			let error = exc && exc.error != undefined ? exc.error : (exc && exc.message != undefined ? exc.message : exc);
			let result = exc && exc.result != undefined ? exc.result : undefined;
			let endpoint_missing = result != undefined && result.status == 404;
			endpoint_missing = endpoint_missing || (typeof error === 'string' && error.indexOf('Not Found') !== -1);
			if (endpoint_missing) {
				T.logWarn("Auto layout endpoint is unavailable on the running server; using built-in layout fallback. Restart FlexBE WebUI server to enable the Python layout service.");
				that.applyLayeredGraphLayout();
				finishAutoLayout(container, previous_snapshot, "Applied fallback auto layout to '" + container.getStateName() + "'.");
				return;
			}
			T.logError("Auto layout failed: " + error);
		}
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
		updateRenderConfig();
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
		state_drawings_map = new Map();

		// draw
		let init_dot = displayInitialDot();
		drawings.push(init_dot);
		state_drawings_map.set(init_dot.obj.getStateName(), init_dot.drawing);

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
			let sd;
			if (s instanceof Statemachine)
				sd = new Drawable.Statemachine(s, R, zoom_fit_active, Drawable.State.Mode.OUTCOME, a, l);
			else if (s instanceof BehaviorState)
				sd = new Drawable.BehaviorState(s, R, zoom_fit_active, Drawable.State.Mode.OUTCOME, a, l);
			else
				sd = new Drawable.State(s, R, zoom_fit_active, Drawable.State.Mode.OUTCOME, a, l);
			drawings.push(sd);
			state_drawings_map.set(s.getStateName(), sd.drawing);

			if (s.getPosition().x > sm_extents.x) sm_extents.x = s.getPosition().x + that.getGridSize()*2;
			if (s.getPosition().y > sm_extents.y) sm_extents.y = s.getPosition().y + that.getGridSize()*2;

		}
		for (let i=0; i<sm_outcomes.length; ++i) {
			o = sm_outcomes[i];
			let obj = new Drawable.Outcome(o, R, zoom_fit_active, !outcomes_displayed);
			drawings.push(obj);
			state_drawings_map.set(o.getStateName(), obj.drawing);
			if (o.getPosition().x > sm_extents.x) sm_extents.x = o.getPosition().x + that.getGridSize();
			if (o.getPosition().y > sm_extents.y) sm_extents.y = o.getPosition().y + that.getGridSize();
		}

		// draw transitions at last
		let transitions_readonly = that.isReadonly() || dataflow_displayed;
		let transition_merge_map = new Map();
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
			}
			if (t.getEnd() != undefined){
				Drawable.Helper.endPointClick(dt.drawing[2][1], dt.drawing[2][1].data("corners"));
				t.setEnd({
					x: dt.drawing[2][1].attr("cx"),
					y: dt.drawing[2][1].attr("cy")
				});
			}
			let merge_key = dt.obj.getFrom().getStateName() + '\0' + dt.obj.getTo().getStateName();
			let existing = transition_merge_map.get(merge_key);
			if (existing != undefined) {
				dt.merge(existing);
			}
			transition_merge_map.set(merge_key, dt);
			drawings.push(dt);

			if (t.getX() != undefined && t.getX() > sm_extents.x) sm_extents.x = t.getX() + that.getGridSize()*2;
			if (t.getY() != undefined && t.getY() > sm_extents.y) sm_extents.y = t.getY() + that.getGridSize()*2;
		}

		if (dataflow_displayed) {
			let dataflow_merge_map = new Map();
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
				let merge_key = dt.obj.getFrom().getStateName() + '\0' + dt.obj.getTo().getStateName();
				let existing = dataflow_merge_map.get(merge_key);
				if (existing != undefined) {
					dt.merge(existing);
				}
				dataflow_merge_map.set(merge_key, dt);
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
		updateCanvasExtentsFromDrawings();

		if (zoom_fit_active) {
			background.attr({fill: '#f7f8fa', stroke: 'none', opacity: 0, cursor: 'default', 'pointer-events': 'auto'});
		} else if (RC.Controller.isReadonly()) {
			background.attr({fill: '#f3f6ff', stroke: '#c5d2ee', opacity: 1, cursor: 'auto', 'pointer-events': 'auto'});
		} else if (displayed_sm.isInsideDifferentBehavior() || Behavior.isReadonly()) {
			background.attr({fill: '#fff3f6', stroke: '#fff3f6', opacity: 1, cursor: 'auto', 'pointer-events': 'auto'});
		} else {
			background.attr({fill: '#FFF', stroke: '#FFF', opacity: 1, cursor: 'auto', 'pointer-events': 'auto'});
		}
		background.toBack();
		if (zoom_fit_active && fit_pan_indicator != undefined && fit_pan_indicator.insertAfter) {
			fit_pan_indicator.insertAfter(background);
		}
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
		if (zoom_fit_active) {
			applyFitViewBox();
		}
	}

	this.getDrawnState = function(state) {
		return state_drawings_map.get(state.getStateName());
	}

	this.beginTransition = function(state, label) {
		if (zoom_fit_active) return;
		if (connecting) return;
		that.removeSelection();

		let autonomy = 0;
		let autonomy_index = state.getOutcomes().indexOf(label);
		if (autonomy_index != -1)
			autonomy = state.getAutonomy()[autonomy_index];

		drag_transition = new Transition(state, undefined, label, autonomy);
		previous_transition_end = undefined;

		connecting = true;
		that.refreshView();
	}

	this.beginInitTransition = function() {
		if (zoom_fit_active) return;
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
		just_connected = undefined;
		that.refreshView();
	}

	this.resetTransition = function(transition) {
		if (zoom_fit_active) return;
		if (connecting) return;
		transition.setBeginning(undefined);
		transition.setEnd(undefined);
		transition.setX(undefined);
		transition.setY(undefined);

		drag_transition = transition;
		previous_transition_end = drag_transition.getTo().getStateName();
		drag_transition.setTo(undefined);

		that.refreshView();
		connecting = true;
		that.refreshView();
	}

	this.removeTransition = function() {
		if (zoom_fit_active) return;
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
			if (!displayed_sm.isConcurrent()
				&& to != undefined
				&& displayed_sm.getOutcomes().contains(to.split('#')[0])) {
				displayed_sm.tryDuplicateOutcome(to.split('#')[0]);
			}
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
		if (zoom_fit_active) return;
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
			if (!has_transition) {
				drag_transition.setTo(state);
				displayed_sm.addTransition(drag_transition);
			} else {
				displayed_sm.retargetTransition(drag_transition, state);
				if (!displayed_sm.isConcurrent()
					&& undo_end != undefined
					&& displayed_sm.getOutcomes().contains(undo_end.split('#')[0])) {
					displayed_sm.tryDuplicateOutcome(undo_end.split('#')[0]);
				}
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
		just_connected = undefined;
		that.refreshView();

		ActivityTracer.addActivity(ActivityTracer.ACT_TRANSITION,
			is_initial?
			"Set initial state to " + state.getStateName()
			: "Connected outcome " + outcome + " of " + from + " with " + state.getStateName().split('#')[0],
			function() {
				let container = (container_path == "")? Behavior.getStatemachine() : Behavior.getStatemachine().getStateByPath(container_path);
				let target = container.getStateByName(undo_end);
				if (target == undefined
					&& undo_end != undefined
					&& container.getOutcomes().contains(undo_end.split('#')[0])) {
					target = container.getSMOutcomeByName(undo_end);
				}
				if (is_initial) {
					container.setInitialState(target);
				} else {
					let transition = container.getTransitions().findElement(function(trans) {
						return trans.getFrom().getStateName() == from && trans.getOutcome() == outcome;
					});
					if (target != undefined) {
						container.retargetTransition(transition, target);
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
						container.retargetTransition(transition, target);
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
			let b;
			if (element.drawing != undefined && element.drawing.cached_bbox != undefined) {
				let pos = element.obj.getPosition();
				b = {
					x: pos.x + pan_shift.x,
					y: pos.y + pan_shift.y,
					width: element.drawing.cached_bbox.width,
					height: element.drawing.cached_bbox.height,
				};
			} else {
				b = element.drawing.getBBox();
			}
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

			let temp_dict = {t: t};
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
					if (width != 0) {
						xShift = Math.abs(t.getX()-otherX)/width * (state.getPosition().x-old_pos.x);
					}
					if (height != 0) {
						yShift = Math.abs(t.getY()-otherY)/height * (state.getPosition().y-old_pos.y);
					}
				}else if(t.getFrom().getStateName() == state.getStateName()){
					temp_dict.x = t.getX();
					temp_dict.y = t.getY();
					otherX = t.getTo().getPosition().x;
					otherY = t.getTo().getPosition().y;
					width = Math.abs(old_pos.x - otherX);
					height = Math.abs(old_pos.y - otherY);
					if (width != 0) {
						xShift = Math.abs(t.getX()-otherX)/width * (state.getPosition().x-old_pos.x);
					}
					if (height != 0) {
						yShift = Math.abs(t.getY()-otherY)/height * (state.getPosition().y-old_pos.y);
					}
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
		} else if (event.key === "Escape"
			&& UI.Panels.isActivePanel != undefined
			&& UI.Panels.isActivePanel(UI.Panels.STATE_PROPERTIES_PANEL)
			&& UI.Panels.closeActiveStateProperties != undefined) {
			event.preventDefault(); // Prevent the default action
			event.stopPropagation(); // Stop the event from propagating to other handlers
			UI.Panels.closeActiveStateProperties();
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
