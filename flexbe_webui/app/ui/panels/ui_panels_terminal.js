UI.Panels.Terminal = new (function() {
	var that = this;
	var debug_mode = false;
	var is_active = false;
	var had_error = false;
	var keep_open = false;
	const MAX_TERMINAL_LINES = 1000;

	var trimTerminalHistory = function(terminal) {
		if (terminal.children.length <= MAX_TERMINAL_LINES) {
			return;
		}

		let linesToRemove = Math.floor(terminal.children.length / 2);
		console.log(`throwing away the ${linesToRemove} oldest lines from terminal!`);
		for (let i = 0; i < linesToRemove; i++) {
			terminal.removeChild(terminal.children[0]);
		}
	}

	var logTerminal = function (msg, color) {
		let terminal = document.getElementById("terminal");

		let entry = document.createElement("div");
		entry.style.color = color;
		entry.textContent = String(msg);
		terminal.appendChild(entry);
		trimTerminalHistory(terminal);
		terminal.scrollTop = document.getElementById("terminal").scrollHeight;
	}


	this.logInfo = function(msg) {
		logTerminal(msg, "white");
		console.log(msg);
	}

	this.logWarn = function(msg) {
		logTerminal(msg, "yellow");
		console.log("[WARN] " + msg);
	}

	this.logError = function(msg) {
		logTerminal(msg, "red");
		console.log("[ERROR] " + msg);
		had_error = true;
		that.show();
	}


	this.debugInfo = function(msg) {
		if (debug_mode) {
			logTerminal("> " + msg, "white");
		}
		console.log(msg);
	}

	this.debugWarn = function(msg) {
		if (debug_mode) {
			logTerminal("> " + msg, "yellow");
		}
		console.log("\x1b[93m[WARN] " + msg + "\x1b[0m");
	}

	this.debugError = function(msg) {
		if (debug_mode) {
			logTerminal("> " + msg, "red");
			that.show();
		}
		console.log("\x1b[91m[ERROR] " + msg + "\x1b[0m");
	}

	this.clearLog = function() {
		let terminal = document.getElementById("terminal");
		while (terminal.children.length > 0) {
			terminal.removeChild(terminal.children[0]);
		}
		had_error = false;
		keep_open = false;
	}

	this.hideIfClean = function() {
		if (!had_error && !keep_open) that.hide();
	}

	this.keepOpen = function() {
		keep_open = true;
	}

	this.show = function() {
		UI.Panels.setActivePanel(UI.Panels.TERMINAL_PANEL);
		is_active = true;
	}

	this.hide = function() {
		UI.Panels.hidePanelIfActive(UI.Panels.TERMINAL_PANEL);
		is_active = false;
		keep_open = false;
	}

	this.toggle = function() {
		if (is_active) that.hide();
		else that.show();
	}

}) ();

T = UI.Panels.Terminal;
