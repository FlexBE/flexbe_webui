IO.ManifestParser = new (function() {
	var that = this;

	this.parseManifest = function(content, file_path, python_path) {
		let parser = new DOMParser();
		let xml = parser.parseFromString(content,"text/xml");

		// structure test
		if (xml.getElementsByTagName("behavior").length != 1
		 || xml.getElementsByTagName("executable").length != 1
		 || xml.getElementsByTagName("executable")[0].getAttribute("package_path") == undefined
		 || xml.getElementsByTagName("executable")[0].getAttribute("package_path").split(".").length < 2
		) return;

		var name = xml.getElementsByTagName("behavior")[0].getAttribute("name");
		var description_raw = (xml.getElementsByTagName("description").length > 0 && xml.getElementsByTagName("description")[0].childNodes.length > 0) ?
			xml.getElementsByTagName("description")[0].childNodes[0].nodeValue.trim().replace(/\s+/, " ") : "";
		var desc_lines = description_raw.split("\n");
		var description = ""
		for (var i = 0; i < desc_lines.length; i++) {
			description += desc_lines[i].trim() + "\n";  // remove indentation from multiline descriptions
		}
		var tags = (xml.getElementsByTagName("tagstring").length > 0 && xml.getElementsByTagName("tagstring")[0].childNodes.length > 0) ?
			xml.getElementsByTagName("tagstring")[0].childNodes[0].nodeValue.trim() : "";
		var author = (xml.getElementsByTagName("author").length > 0 && xml.getElementsByTagName("author")[0].childNodes.length > 0) ?
			xml.getElementsByTagName("author")[0].childNodes[0].nodeValue.trim() : "";
		var date = (xml.getElementsByTagName("date").length > 0 && xml.getElementsByTagName("date")[0].childNodes.length > 0)?
			xml.getElementsByTagName("date")[0].childNodes[0].nodeValue.trim()
			: undefined;

		var path = xml.getElementsByTagName("executable")[0].getAttribute("package_path").split(".");
		var rosnode_name = path[0];
		var codefile_name = path[path.length - 1];
		var codefile_relpath = path.slice(1).join("/");
		var codefile_path = python_path;
		if (path.length > 2) {
			codefile_path += "/" + path.slice(1, -1).join("/");
		}
		var class_name = xml.getElementsByTagName("executable")[0].getAttribute("class");

		var params_element = xml.getElementsByTagName("params");
		var param_list = [];
		if (params_element.length > 0) {
			var params = params_element[0].getElementsByTagName("param");
			for (var i = 0; i < params.length; i++) {
				var p = params[i];
				var p_obj = {
					type: p.getAttribute("type"),
					name: p.getAttribute("name"),
					default: p.getAttribute("default"),
					label: p.getAttribute("label"),
					hint: p.getAttribute("hint"),
					additional: undefined
				};
				if (p_obj.type == "enum") {
					p_obj.additional = [];
					var options = p.getElementsByTagName("option");
					for (var j = 0; j < options.length; j++) {
						p_obj.additional.push(options[j].getAttribute("value"));
					}
				} else if (p_obj.type == "numeric") {
					p_obj.additional = {min: undefined, max: undefined};
					let min_element = p.getElementsByTagName("min")[0];
					let max_element = p.getElementsByTagName("max")[0];
					p_obj.additional.min = min_element ? min_element.getAttribute("value") : undefined;
					p_obj.additional.max = max_element ? max_element.getAttribute("value") : undefined;
				} else if (p_obj.type == "yaml") {
					p_obj.additional = {key: undefined};
					let key_element = p.getElementsByTagName("key")[0];
					p_obj.additional.key = key_element ? key_element.getAttribute("name") : undefined;
				} else if (p_obj.type == "tuple") {
					p_obj.additional = undefined;
				}
				param_list.push(p_obj);
			}
		}

		var contains_elements = xml.getElementsByTagName("contains");
		var contains_list = [];
		for (var i = 0; i < contains_elements.length; i++) {
			var contains_name = contains_elements[i].getAttribute("name");
			var contains_pkg = contains_elements[i].getAttribute("package");
			if (contains_pkg != undefined && contains_pkg != null && contains_pkg != "") {
				contains_list.push({
					name: contains_name,
					package: contains_pkg
				});
			} else {
				contains_list.push(contains_name);
			}
		}

		return {
			name: 			name,
			description: 	description,
			tags: 			tags,
			author: 		author,
			date: 			date,
			rosnode_name: 	rosnode_name,
			codefile_name: 	codefile_name,
			codefile_path: 	codefile_path,
			codefile_relpath: codefile_relpath,
			class_name: 	class_name,
			params: 		param_list,
			contains: 		contains_list,
			file_path: 		file_path
		};
	}

}) ();
