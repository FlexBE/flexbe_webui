UI.Panels.Terminal = new (function() {
	var that = this;
	var debug_mode = false;
	var is_active = false;

	var logTerminal = function (msg, color) {
		let terminal = document.getElementById("terminal");

		if (terminal.innerHTML.length > 80000) {
			// Assuming 80 characters per line
			// allow 1000 lines of history before reducing to last 500
			// (calculation based on 1/2 of actual number of lines)
			let lines = terminal.innerHTML.split("<br>")
			let linesToRemove = Math.floor(lines.length / 2);
			console.log(`throwing away the ${linesToRemove} oldest lines from terminal!`);
			lines = lines.slice(linesToRemove);  // Remove the oldest lines
			// Rejoin the remaining lines and update the terminal content
			terminal.innerHTML = lines.join("<br>") + "<br>";
		}
		terminal.innerHTML += "<font style='color: " + color + ";'>" + msg + "</font><br>";
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
		document.getElementById("terminal").innerHTML += "<br /><br />";
	}

	this.show = function() {
		UI.Panels.setActivePanel(UI.Panels.TERMINAL_PANEL);
		is_active = true;
	}

	this.hide = function() {
		UI.Panels.hidePanelIfActive(UI.Panels.TERMINAL_PANEL);
		is_active = false;
	}

	this.toggle = function() {
		if (is_active) that.hide();
		else that.show();
	}

}) ();

T = UI.Panels.Terminal;