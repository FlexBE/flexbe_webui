let beforeUnloadHandlerRegistered = false;

window.onload = async () => {
	console.log(`Loading UI window ...`);
	Behavior.resetBehavior();

	// Initialize gui panel
	console.log(`Initialize UI panels ...`);
	UI.Statemachine.initialize();
	UI.Menu.toDashboardClicked();
	UI.Dashboard.resetAllFields();
	UI.Dashboard.addBehaviorOutcome('finished');
	UI.Dashboard.addBehaviorOutcome('failed');
	ActivityTracer.resetActivities();
	UI.RuntimeControl.displayLockBehavior();

	console.log(`Initialize controller ...`);
	RC.Controller.initialize();

	API.getData("ready", ready_payload => {
		if (ready_payload.status != 'ok') {
			console.log(`\x1b[91mFlexBE WebUI Server readiness check failed: ${JSON.stringify(ready_payload)}\x1b[0m`);
			RC.ROS.setOfflineMode();
			T.logError("Unable to verify server readiness. Running in offline mode.");
			UI.Settings.setRosProperties('');
			UI.RuntimeControl.setRosProperties('');
			return;
		}
		console.log(`${JSON.stringify(ready_payload)}`);
		const online_mode = ready_payload.online_mode;
		console.log(`\x1b[92mFlexBE WebUI Server is ready (online=${online_mode})!\x1b[0m`);
		API.postFlag("ui_connected", {}, () => {
			console.log("Registered active UI session with server.");
		}, error => {
			console.log(`Failed to register active UI session: ${error}`);
		});

		// Initialize runtime control if not in offline (standalone) mode
		if (online_mode) {
			// console.log(`Calling RC.ROS.trySetupConnection ...`);
			RC.ROS.clearOfflineMode();
			RC.ROS.trySetupConnection();
		} else {
			RC.ROS.setOfflineMode();
			T.logInfo("Running in offline mode; restart using server if ROS connection is required.");
			UI.Settings.setRosProperties('');
			UI.RuntimeControl.setRosProperties('');
		}
	}, error => {
		console.log(`\x1b[91mFlexBE WebUI Server readiness check failed: ${error}\x1b[0m`);
		RC.ROS.setOfflineMode();
		T.logError("Unable to verify server readiness. Running in offline mode.");
		UI.Settings.setRosProperties('');
		UI.RuntimeControl.setRosProperties('');
	});

	// Restore local settings (including statelib)
	console.log(`Connected to server - update settings ...`);
	UI.Settings.retrieveConfigurationSettings();
	UI.Settings.retrievePackageData();
	UI.Feed.initialize();

	// Auto-close the terminal after startup unless a later prompt pins it open.
	setTimeout(() => T.hideIfClean(), 5000);

	// Initialize dashboard tab handling after set up is complete
	UI.Dashboard.setupTabHandling();

	// Capture the beforeunload event to confirm shutdown
	if (!beforeUnloadHandlerRegistered) {
		window.addEventListener('beforeunload', function (event) {
			// Call the custom confirm function
			var confirmExit = UI.Tools.confirmUIExit();
			if (!confirmExit) {
				// Prevent the default action (closing the window)
				event.preventDefault();
			}
		});
		beforeUnloadHandlerRegistered = true;
	}

	console.log(`\x1b[95m  Active element is '${document.activeElement ? document.activeElement.id : 'undefined'}'\x1b[0m`);
}

window.onerror = function(message, source, lineno, colno, error) {
    console.error(`Error: ${message}, Source: ${source}, Line: ${lineno}, Column: ${colno}, Error object: ${error}`);
};
