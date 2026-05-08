Drawable.Note = function(note_obj, paper) {
	var that = this;
	var font_size = Drawable.Helper.scaled(10, 8);
	var wrap_width = Drawable.Helper.scaled(200, 140);
	var bg_width = Drawable.Helper.scaled(213, 150);
	var text_x = Drawable.Helper.scaled(10, 8);
	var text_y = Drawable.Helper.scaled(5, 4);
	var text_padding_y = Drawable.Helper.scaled(10, 8);
	var text_padding_x = Drawable.Helper.scaled(15, 12);
	var line_width = Drawable.Helper.scaled(3, 2);
	var border_width = Drawable.Helper.scaled(3, 2);

	var note = paper.set();

	var ox = 0, oy = 0, lx = 0, ly = 0;

	var isFitView = function() {
		return UI.Statemachine.isFitView && UI.Statemachine.isFitView();
	}

	var moveFnc = function(dx, dy, x, y, evt) {
		if (isFitView()) return;
		lx = dx + ox;
		ly = dy + oy;
		lx = Math.min(Math.max(lx, 0), UI.Statemachine.getR().width - this.getBBox().width);
		ly = Math.min(Math.max(ly, 0), UI.Statemachine.getR().height - this.getBBox().height);
		note.attr({x: lx, y: ly});
	}
	var startFnc = function() {
		if (isFitView()) return;
		lx = note_obj.getPosition().x;
		ly = note_obj.getPosition().y;
		ox = note_obj.getPosition().x;
		oy = note_obj.getPosition().y;
	}
	var endFnc = function(evt) {
		if (isFitView()) return;
		note_obj.setPosition({x: lx, y: ly});
	}

	var wrapText = function(text, width) {
		var words = text.split(" ");
		var wrapped = "";
		var t = paper.text(100, 100).attr('text-anchor', 'start').attr({'font-size': font_size, 'font-family': 'monospace'});

		for (var i=0; i<words.length; i++) {
			t.attr("text", wrapped + " " + words[i]);
			if (t.getBBox().width > width) {
				wrapped += "\n" + words[i];
			} else {
				wrapped += " " + words[i];
			}
		}

		t.remove();
		return wrapped;
	}

	this.editNote = function() {
		if (isFitView()) return;
		var editor = document.getElementById("note_editor"),
			text_input = document.getElementById("input_note_editor_text"),
			delete_btn = document.getElementById("button_note_editor_delete"),
			save_btn = document.getElementById("button_note_editor_save"),
			important_cb = document.getElementById("cb_note_editor_important");

		if (editor == undefined || text_input == undefined || delete_btn == undefined
			|| save_btn == undefined || important_cb == undefined) {
			T.logError("Note editor is not available.");
			return;
		}
		var color = note_obj.isImportant()? '#600' : '#000';

		if (editor._noteEditorCleanup != undefined) {
			editor._noteEditorCleanup();
		}

		editor.style.display = "block";
		editor.style.backgroundColor = "#ccc";
		editor.style.borderLeft = `${border_width}px solid ${color}`;
		text_input.style.color = color
		text_input.value = note_obj.getContent();
		important_cb.checked = note_obj.isImportant();

		text_input.focus({ preventScroll: true });

		var hide = function() {
			editor.style.display = "none";
			save_btn.removeEventListener('click', saveCB);
			important_cb.removeEventListener('change', importantCB);
			delete_btn.removeEventListener('click', deleteCB);
			editor._noteEditorCleanup = undefined;
		}
		var saveCB = function() {
			if (text_input.value == "") {
				Behavior.removeCommentNote(note_obj);
			} else {
				note_obj.setContent(text_input.value);
			}
			hide();
			UI.Statemachine.refreshView();
		};
		var importantCB = function(evt) {
			note_obj.setImportant(evt.target.checked);
			color = note_obj.isImportant()? '#600' : '#000';
			editor.style.borderLeft = `${border_width}px solid ${color}`;
			text_input.style.color = color
			txt.attr({'fill': color});
			line.attr({'fill': color});
		};
		var deleteCB = function() {
			Behavior.removeCommentNote(note_obj);
			hide();
			UI.Statemachine.refreshView();
		}

		save_btn.addEventListener('click', saveCB);
		important_cb.addEventListener('change', importantCB);
		delete_btn.addEventListener('click', deleteCB);
		editor._noteEditorCleanup = hide;
	}

	var color = note_obj.isImportant()? '#600' : '#000';

	var bg = paper.rect(0, 0, bg_width, 0)
		.attr({'fill': 'rgba(0, 0, 0, .1)', 'stroke-opacity': 0.0});
	var txt = paper.text(text_x, text_y, wrapText(note_obj.getContent(), wrap_width))
		.attr({"text-anchor": 'start', 'fill': color, 'font-size': font_size, 'font-family': 'monospace'});

	bg.attr({'height': txt.getBBox().height + text_padding_y, 'width': txt.getBBox().width + text_padding_x});

	var line = paper.rect(0, 0, line_width, bg.getBBox().height)
		.attr({'stroke-opacity': 0.0, 'fill': color});

	note.push(bg);
	note.push(txt);
	note.push(line);

	txt.translate(text_x, text_y + txt.getBBox().height / 2);

	note.attr({x: note_obj.getPosition().x, y: note_obj.getPosition().y});
	if (!isFitView()) {
		note.drag(moveFnc, startFnc, endFnc)
			.dblclick(that.editNote);
	}

	this.drawing = note;
	this.obj = note_obj;

};
