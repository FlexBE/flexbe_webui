const API = new (function(version) {
	var that = this;

	// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
	this.post = function(action, content, callback) {
		that.post_raw(action, content)
		.then(response => response.json())
		.then(result => callback(result));
	}

	this.post_raw = function(action, content) {
		return fetch(`api/${version}/${action}`, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify(content)
		});
	}

	this.get = function(action, callback) {
		that.get_raw(action)
		.then(response => response.json())
		.then(result => callback(result));
	}

	this.get_raw = function(action) {
		return fetch(`api/${version}/${action}`, {method: "GET"});
	}

	this.get_async = function(action) {
		return new Promise((resolve) => {
			API.get(action, result => {
				resolve(result);
			});
		});
	};
	// Examples:
	// const response = await post("publish", {"msg": "bla"});
	// const result = await response.json();
	// console.log(result.message);
	// return;
	// const response = await get("packages/all");
	// const package_list = await response.json();
	// console.log(package_list);

}) ("v1");
