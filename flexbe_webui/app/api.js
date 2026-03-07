const API = new (function(version) {
	var that = this;
	const REQUEST_TIMEOUT_MS = 15000;

	// API contract:
	// - success=false means request-level failure; callers must not continue normal processing.
	// - success=true means the request contract succeeded and any domain outcome is in data.
	// - command-style mutation endpoints use data.ok for explicit success/failure.

	function fetchWithTimeout(url, options) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		return fetch(url, {...options, signal: controller.signal})
			.finally(() => clearTimeout(timeout));
	}

	function extractError(payload, fallback) {
		if (payload && typeof payload === "object") {
			return payload.text || payload.detail || payload.reason || payload.error_msg || payload.message || fallback;
		}
		if (typeof payload === "string" && payload !== "") {
			return payload;
		}
		return fallback;
	}

	function normalizeResponse(response, payload) {
		let normalized = {
			success: false,
			data: null,
			error: null,
			status: response.status
		};

		if (!response.ok) {
			normalized.data = payload;
			normalized.error = extractError(payload, response.statusText || `HTTP ${response.status}`);
			return normalized;
		}

		if (typeof payload === "boolean") {
			normalized.success = payload;
			normalized.data = payload;
			normalized.error = payload ? null : "request failed";
			return normalized;
		}

		if (Array.isArray(payload) || typeof payload === "string" || typeof payload === "number" || payload == null) {
			normalized.success = true;
			normalized.data = payload;
			return normalized;
		}

		if (typeof payload === "object") {
			if (typeof payload.success === "boolean") {
				normalized.success = payload.success;
			} else if (typeof payload.result === "boolean") {
				normalized.success = payload.result;
			} else if (typeof payload.install_success === "boolean") {
				normalized.success = payload.install_success;
			} else {
				normalized.success = true;
			}
			normalized.data = payload;
			normalized.error = normalized.success ? null : extractError(payload, "request failed");
			return Object.assign(normalized, payload);
		}

		normalized.success = true;
		normalized.data = payload;
		return normalized;
	}

	function parseResponse(response) {
		return response.text().then(text => {
			if (text === "") {
				return normalizeResponse(response, null);
			}
			try {
				return normalizeResponse(response, JSON.parse(text));
			} catch (error) {
				return {
					success: false,
					data: null,
					error: "invalid JSON response",
					status: response.status,
					raw_text: text
				};
			}
		});
	}

	function buildRequestFailure(error) {
		return {
			success: false,
			data: null,
			error: error.message || "request failed",
			status: 0
		};
	}

	function hasRequiredData(result) {
		return result.data !== undefined && result.data !== null;
	}

	// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
	this.post = function(action, content, callback) {
		Promise.resolve()
		.then(() => that.post_raw(action, content))
		.then(response => parseResponse(response))
		.then(result => callback(result))
		.catch(error => {
			console.error(`POST api/${version}/${action} failed:`, error);
			callback(buildRequestFailure(error));
		});
	}

	this.post_raw = function(action, content) {
		return fetchWithTimeout(`api/${version}/${action}`, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify(content)
		});
	}

	this.get = function(action, callback) {
		that.get_raw(action)
		.then(response => parseResponse(response))
		.then(result => callback(result))
		.catch(error => {
			console.error(`GET api/${version}/${action} failed:`, error);
			callback(buildRequestFailure(error));
		});
	}

	this.get_raw = function(action) {
		return fetchWithTimeout(`api/${version}/${action}`, {method: "GET"});
	}

	this.get_async = function(action) {
		return new Promise((resolve) => {
			API.get(action, result => {
				resolve(result);
			});
		});
	};

	this.errorText = function(result, fallback="request failed") {
		if (result && typeof result.error === "string" && result.error !== "") {
			return result.error;
		}
		return fallback;
	};

	this.expect = function(result, onSuccess, onError, options={}) {
		const requireData = options.requireData === true;
		const validate = options.validate;
		const fallbackError = options.fallbackError || "request failed";

		if (!result || result.success !== true) {
			if (onError) {
				onError(that.errorText(result, fallbackError), result);
			}
			return false;
		}

		if (requireData && !hasRequiredData(result)) {
			if (onError) {
				onError(that.errorText(result, fallbackError), result);
			}
			return false;
		}

		if (typeof validate === "function" && !validate(result.data, result)) {
			if (onError) {
				onError(that.errorText(result, fallbackError), result);
			}
			return false;
		}

		if (onSuccess) {
			onSuccess(result.data, result);
		}
		return true;
	};

	this.getData = function(action, onSuccess, onError, options={}) {
		that.get(action, result => {
			that.expect(result, onSuccess, onError, {...options, requireData: true});
		});
	};

	this.postData = function(action, content, onSuccess, onError, options={}) {
		that.post(action, content, result => {
			that.expect(result, onSuccess, onError, {...options, requireData: true});
		});
	};

	this.getDataAsync = function(action, options={}) {
		return new Promise((resolve, reject) => {
			that.getData(action,
				(data, result) => resolve({data, result}),
				(error, result) => reject({error, result}),
				options);
		});
	};

	this.postDataAsync = function(action, content, options={}) {
		return new Promise((resolve, reject) => {
			that.postData(action, content,
				(data, result) => resolve({data, result}),
				(error, result) => reject({error, result}),
				options);
		});
	};

	this.getFlag = function(action, onSuccess, onError, options={}) {
		that.get(action, result => {
			that.expect(result, onSuccess, onError, {
				...options,
				requireData: true,
				validate: data => data && data.ok === true
			});
		});
	};

	this.postFlag = function(action, content, onSuccess, onError, options={}) {
		that.post(action, content, result => {
			that.expect(result, onSuccess, onError, {
				...options,
				requireData: true,
				validate: data => data && data.ok === true
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
