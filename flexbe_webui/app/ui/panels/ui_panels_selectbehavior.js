UI.Panels.SelectBehavior = new (function() {
	var that = this;

	var be_list = [];
	var be_list_displayed = [];
	var listeners_to_cleanup = [];
	var selection_callback = undefined;
	var caret_position = 0;
	var enable_hover = false;

	this.addHoverDetails = function(el, be_def) {
		let details = "<div style='margin-bottom: 0.5em;'>";
		details += "Package: <i>" + be_def.getStatePackage() + "</i><br />";
		details += "Tags: <i>" + be_def.getBehaviorTagList().join(", ") + "</i>";
		details += "</div>";
		let params = be_def.getParameters();
		if (params.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Parameters:";
			params.forEach(param => {
				details += "<br />&nbsp;&nbsp;- " + param;
				let doc = be_def.getParamDesc().findElement(desc => { return desc.name == param; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let input_keys = be_def.getInputKeys().filter(key => !key.startsWith("$"));
		if (input_keys.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Input Keys:";
			input_keys.forEach(key => {
				details += "<br />&nbsp;&nbsp;- " + key;
				let doc = be_def.getInputDesc().findElement(desc => { return desc.name == key; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let output_keys = be_def.getOutputKeys().filter(key => !key.startsWith("$"));
		if (output_keys.length > 0) {
			details += "<div style='margin-bottom: 0.5em;'>Output Keys:";
			output_keys.forEach(key => {
				details += "<br />&nbsp;&nbsp;- " + key;
				let doc = be_def.getOutputDesc().findElement(desc => { return desc.name == key; });
				if (doc != undefined) details += "&nbsp;&nbsp;<i>" + doc.type + "</i>";
			});
			details += "</div>";
		}
		let outcomes = be_def.getOutcomes().filter(outcome => !outcome.startsWith("$"));
		if (outcomes.length > 0) {
			details += "<div style='margin-bottom: 0em;'>Outcomes:";
			outcomes.forEach(outcome => {
				details += "<br />&nbsp;&nbsp;- " + outcome;
			});
			details += "</div>";
		}

		const hoverHandler = function(event) {
			event.stopPropagation();
			event.preventDefault();
			let rect = this.getBoundingClientRect();
			let tt = document.createElement("div");
			tt.setAttribute("style", "right: 370px; top: " + rect.top + "px; display: block;");
			tt.setAttribute("class", "sidepanel_tooltip");
			tt.setAttribute("id", "select_behavior_tooltip");
			tt.innerHTML = details;
			document.getElementsByTagName("body")[0].appendChild(tt);
			if (tt.getBoundingClientRect().bottom >= window.innerHeight - 5) {
				tt.setAttribute("style", "right: 370px; bottom: 5px; display: block;");
			}
		}
		el.addEventListener('mouseover', hoverHandler);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseover', 'handler': hoverHandler});

		el.addEventListener('mouseout', that.removeHover);
		listeners_to_cleanup.push({'element': el, 'listener_type': 'mouseout', 'handler': that.removeHover});
	}

	this.removeHover = function(event=undefined) {
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}
		let tt = document.getElementById("select_behavior_tooltip");
		if (tt != undefined) {
			tt.parentNode.removeChild(tt);
		}
	}

	this.filterBehaviorList = function() {
		that.removeHover();
		let filter_exp = document.getElementById("input_behavior_filter").value;
		let filter_pkg = document.getElementById("input_behavior_package_filter").value;
		let tag_update_args = {tag: undefined, modifier: undefined};
		let be_list_tagged = be_list.clone();
		filter_exp = filter_exp.replace(/(?:^|\s)([+-])([^\s]*)(?=$|\s)/gi, function(match, modifier, tag) {
			if (tag != "") {
				let need = modifier == "+";
				let relevant = false;
				let be_list_tagged_clone = be_list_tagged.clone().filter(function(b) {
					let has_tag = b.getBehaviorTagList().contains(tag);
					relevant = relevant || has_tag;
					return need == has_tag;
				});
				if (relevant) {
					be_list_tagged = be_list_tagged_clone;
				} else {
					tag_update_args = {tag: tag, modifier: modifier};
				}
			}
			return "";
		}).trim();

		if (filter_pkg != "ALL") {
			be_list_tagged = be_list_tagged.filter(function(element) {
				return element.getStatePackage() == filter_pkg;
			});
		}

		if (filter_exp != filter_exp.toLowerCase()) {
			filter_exp = filter_exp.toLowerCase();
		}
		// After processing tags, look for matches in remaining filter express in names
		let begin_list = be_list_tagged.filter(function(element) {
			return element.getBehaviorName().toLowerCase().indexOf(filter_exp) == 0;
		});
		let contain_list = be_list_tagged.filter(function(element) {
			return element.getBehaviorName().toLowerCase().indexOf(filter_exp) > 0;
		});

		that.displayBehaviors(begin_list, true);
		that.displayBehaviors(contain_list, false);
		that.updateTags(tag_update_args.tag, tag_update_args.modifier);
		UI.Panels.updatePanelTabTargets(UI.Panels.SELECT_BEHAVIOR_PANEL);
	}

	this.updateTags = function(tag, modifier) {
		let tag_list = [];
		let filter_exp = document.getElementById("input_behavior_filter").value;
		be_list_displayed.forEach(function(b) {
			b.getBehaviorTagList().forEach(function(t) {
				if (t == "" || filter_exp.indexOf("+"+t) != -1 || filter_exp.indexOf("-"+t) != -1) return;
				let entry = tag_list.findElement(function(e) { return e.tag == t; })
				if (entry != undefined) {
					entry.count++;
				} else {
					tag_list.push({tag: t, count: 1});
				}
			});
		});

		let sorted_tags = [];
		if (tag != undefined) {
			sorted_tags = sorted_tags.concat(tag_list.filter(function(element) {
				return element.tag.indexOf(tag) == 0;
			}));
			sorted_tags = sorted_tags.concat(tag_list.filter(function(element) {
				return element.tag.indexOf(tag) > 0;
			}));
			sorted_tags = sorted_tags.concat(tag_list.filter(function(element) {
				return element.tag.indexOf(tag) < 0;
			}));
		} else {
			sorted_tags = tag_list.sort(function(a, b) { return b.count - a.count; });
		}

		let tag_panel = document.getElementById("behavior_tag_filter");
		that.clearChildElements("input_behavior_filter");
		tag_panel.innerHTML = "";
		let tag_width = 0;
		for (let i = 0; i < sorted_tags.length; i++) {
			let t = sorted_tags[i].tag;
			let element = document.createElement("div");
			element.setAttribute("class", "tag");
			element.setAttribute("title", sorted_tags[i].count + " behavior" + ((sorted_tags[i].count != 1)? "s" : ""));
			element.setAttribute("id", "input_behavior_filter"+"_"+t);
			element.setAttribute("tabindex", "0");
			element.innerText = t;
			const clickTagHandler = function(event) {
				event.stopPropagation();
				event.preventDefault();
				if (tag != undefined) {
					let txt = document.getElementById("input_behavior_filter").value;
					txt = txt.replace(modifier + tag, modifier + element.innerText);
					document.getElementById("input_behavior_filter").value = txt;
					document.getElementById("input_behavior_filter").focus({ preventScroll: true });
					let idx = txt.indexOf(modifier + element.innerText);
					document.getElementById("input_behavior_filter").setSelectionRange(idx, idx + (modifier + element.innerText).length + 1);
				} else {
					let txt = document.getElementById("input_behavior_filter").value;
					let added = ((txt == "")? "" : " ") + "+" + element.innerText;
					document.getElementById("input_behavior_filter").value += added;
					document.getElementById("input_behavior_filter").focus({ preventScroll: true });
					let idx = (txt + added).indexOf(added);
					document.getElementById("input_behavior_filter").setSelectionRange(idx, idx + added.length + 1); // highlight new text
				}
				that.behaviorFilterChanged();
			}

			element.addEventListener("click", clickTagHandler);
			listeners_to_cleanup.push({'element': element, 'listener_type': 'click', 'handler': clickTagHandler});

			const enterTagHandler = function(event) {
				if (event.key === 'Enter' || event.key === ' ') {
					// allow selection from Enter or spacebar
					clickTagHandler(event);
				}
			}
			element.addEventListener('keydown', enterTagHandler);
			listeners_to_cleanup.push({'element': element, 'listener_type': 'keydown', 'handler': enterTagHandler});

			tag_panel.appendChild(element);
			if (tag_width + element.clientWidth + 4 + 30 < tag_panel.clientWidth) {
				tag_width += element.clientWidth + 4;
			} else {
				tag_panel.removeChild(tag_panel.lastChild);
				let dots = document.createElement("i");
				dots.innerText = " ...";
				let hidden = sorted_tags.length - i;
				dots.setAttribute("title", hidden + " more tag" + ((hidden == 1)? "" : "s"));
				tag_panel.appendChild(dots);
				break;
			}
		}
		if (tag_panel.children.length == 0) {
			tag_panel.innerHTML = "<i>no tags</i>";
		}
	}

	this.clearChildElements = function(filter='') {
		const elementsToRemove = new Set();
		listeners_to_cleanup.forEach(({element, listener_type, handler}) => {
			if (element.id.startsWith(filter)) {
				element.removeEventListener(listener_type, handler);
				elementsToRemove.add(element);
			}
		});
		listeners_to_cleanup = listeners_to_cleanup.filter(({ element, listener_type, handler }) => !elementsToRemove.has(element));

		const elementsToRemoveArray = Array.from(elementsToRemove);
		elementsToRemoveArray.forEach(child => {
			if (child.parentNode) {
				child.parentNode.removeChild(child);
			}
			elementsToRemove.delete(child);
		});
	}
	this.displayBehaviors = function(behaviors, clear) {
		let panel = document.getElementById('panel_select_behavior_selection');
		if (clear) {
			that.clearChildElements("panel_select_behavior_selection_behavior_");
			panel.innerHTML = "";
			be_list_displayed.length = 0;
		}

		let prior_length = be_list_displayed.length;
		behaviors.forEach(function(b, index) {
			let m = b.getBehaviorManifest();
			be_list_displayed.push(b);

			behavior_div = document.createElement("div");
			behavior_div.setAttribute("class", "panel_select_behavior_selection_behavior");
			behavior_div.setAttribute("id", `panel_select_behavior_selection_behavior_${prior_length + index}`);
			behavior_div.setAttribute("tabindex", "0");
			behavior_div.innerHTML =
				  '<b>' + m.name + '</b><br />'
				+ '<i>' + m.description + '</i>';

			const clickBehaviorHandler = function(event) {
				event.preventDefault(); // Prevent default action for Enter key
				event.stopPropagation(); // Stop the event from propagating to other handlers
				selection_callback(m);
				that.hide();
			}
			behavior_div.addEventListener('click', clickBehaviorHandler);
			listeners_to_cleanup.push({'element': behavior_div, 'listener_type': 'click', 'handler': clickBehaviorHandler});

			const enterBehaviorHandler = function(event) {
				if (event.key === 'Enter' || event.key === ' ') {
					// allow selection from Enter or spacebar
					clickBehaviorHandler(event);
				}
			}
			behavior_div.addEventListener('keydown', enterBehaviorHandler);
			listeners_to_cleanup.push({'element': behavior_div, 'listener_type': 'keydown', 'handler': enterBehaviorHandler});

			if (enable_hover) that.addHoverDetails(behavior_div, b);

			panel.appendChild(behavior_div);
		});
	}


	this.setSelectionCallback = function(callback) {
		selection_callback = callback;
	}
	this.enableHover = function() {
		enable_hover = true;
	}

	this.clickPanel = function(event) {
		// prevent shifting focus while the panel is active
		event.stopPropagation();
		event.preventDefault();
	}

	this.show = function() {
		if (selection_callback == undefined) {
			T.debugWarn("No behavior selection callback set!");
		}
		let panel = document.getElementById('panel_select_behavior_selection');
		panel.focus({preventScroll: true});

		be_list = WS.Behaviorlib.getBehaviorList();
		that.displayBehaviors(be_list, true);
		that.updateTags();
		UI.Settings.createBehaviorPackageSelect(document.getElementById("input_behavior_package_filter"), true);
		panel.addEventListener("click", that.clickPanel);
		UI.Panels.setActivePanel(UI.Panels.SELECT_BEHAVIOR_PANEL);
	}

	this.hide = function() {
		UI.Panels.hidePanelIfActive(UI.Panels.SELECT_BEHAVIOR_PANEL);
		selection_callback = undefined;
		document.getElementById("input_behavior_filter").value = "";
		document.activeElement.blur();
		enable_hover = false;
		that.removeHover();
		that.clearChildElements();
		let panel = document.getElementById('panel_select_behavior_selection');
		panel.removeEventListener("click", that.clickPanel);
	}

	this.behaviorFilterChanged = function() {
		that.filterBehaviorList();
		caret_position = document.getElementById("input_behavior_filter").selectionStart;
	}

	this.behaviorSelectCancelClicked = function() {
		that.hide();
	}

}) ();
