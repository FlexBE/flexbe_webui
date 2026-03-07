Drawable.ContainerPath = function(container_obj, target_paper, click_handler, color) {

	var paper = target_paper;
	var font_size = Drawable.Helper.scaled(10, 8);
	var y = Drawable.Helper.scaled(10, 8);
	var height = Drawable.Helper.scaled(20, 16);
	var start_offset = Drawable.Helper.scaled(10, 8);
	var spacing = Drawable.Helper.scaled(10, 8);

	var offset = start_offset;
	var containers = [];
	var set = paper.set();

	var bg = paper.rect(0, 0, 10, height)
		.attr({'stroke-opacity': 0});
	if (color != undefined) bg
		.attr({'fill': color, 'fill-opacity': 0.8, 'stroke-opacity': 0});
	else bg
		.attr({'fill-opacity': 0});
	set.push(bg);

	containers.push(container_obj);
	while(containers[containers.length - 1].getContainer() != undefined) {
		containers.push(containers[containers.length - 1].getContainer());
	}

	for (var i = containers.length - 1; i >= 0; i--) {
		var c = containers[i];
		var text = (c.getStateName() == "")? Behavior.getBehaviorName() + " (root)" : c.getStateName();
		text = (c.getBehavior() != undefined)? text + " (Behavior)" : text;
		var element = paper.text(offset, y, text)
			.attr({"text-anchor": 'start', 'font-size': font_size});
		if (i > 0) element
			.attr({"cursor": 'pointer'})
			.data("statemachine", c)
			.click(click_handler);
		else element
			.attr({"font-weight": 'bold'});
		offset += element.getBBox().width + spacing;
		set.push(element);
		if (i > 0) {
			var separator = paper.text(offset, y, ">")
				.attr({"text-anchor": 'start', 'font-size': font_size});
			offset += separator.getBBox().width + spacing;
			set.push(separator);
		}
	}
	bg.attr({'width': offset});

	return {
		drawing: set,
		obj: new State("CONTAINER", WS.Statelib.getFromLib(":CONTAINER"))
	};
};
