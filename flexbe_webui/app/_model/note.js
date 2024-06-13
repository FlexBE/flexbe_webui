const Note = function(text) {

	var content = text;
	var position = {x: 40, y:30};
	var container_path = "/";

	var is_collapsed = true;
	var is_important = false;

	this.getContent = function() {
		return content;
	}
	this.setContent = function(text) {
		content = text;
	}

	this.getPosition = function() {
		return position;
	}
	this.setPosition = function(new_position) {
		position = new_position;
	}

	this.getContainerPath = function() {
		return container_path;
	}
	this.setContainerPath = function(new_container_path) {
		container_path = new_container_path;
	}

	this.isCollapsed = function() {
		return is_collapsed;
	}
	this.setCollapsed = function(new_is_collapsed) {
		is_collapsed = new_is_collapsed;
	}

	this.isImportant = function() {
		return is_important;
	}
	this.setImportant = function(new_is_important) {
		is_important = new_is_important;
	}

	this.toJSON = function() {
		return {
			content: content,
			position_x: position.x,
			position_y: position.y,
			container_path: container_path,
			is_collapsed: is_collapsed,
			is_important: is_important
		}
	}

};