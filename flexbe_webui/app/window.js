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

	API.get("ready", ready_result => {
		console.log(`${JSON.stringify(ready_result)}`);
		const online_mode = ready_result.online_mode;
		if (ready_result.status == 'ok'){
			console.log(`\x1b[92mFlexBE WebUI Server is ready (online=${online_mode})!\x1b[0m`);
		} else {
			console.log(`\x1b[91mFlexBE WebUI Server returned unexpected status ${ready_result.status}\x1b[0m`);
		}

		// Initialize runtime control if not in offline (standalone) mode
		if (online_mode) {
			// console.log(`Calling RC.ROS.trySetupConnection ...`);
			RC.ROS.trySetupConnection();
		} else {
			RC.ROS.setOfflineMode();
			T.logInfo("Running in offline mode; restart using server if ROS connection is required.");
			UI.Settings.setRosProperties('');
			UI.RuntimeControl.setRosProperties('');
		}
	});

	// Restore local settings (including statelib)
	console.log(`Connected to server - update settings ...`);
	UI.Settings.retrieveConfigurationSettings();
	UI.Settings.retrievePackageData();
	UI.Feed.initialize();

	// Initialize dashboard tab handling after set up is complete
	UI.Dashboard.setupTabHandling();

	// Capture the beforeunload event to confirm shutdown
	window.addEventListener('beforeunload', function (event) {
		// Call the custom confirm function
		var confirmExit = UI.Tools.confirmUIExit();
		if (!confirmExit) {
			// Prevent the default action (closing the window)
			event.preventDefault();
		}
	});

	console.log(`\x1b[95m  Active element is '${document.activeElement ? document.activeElement.id : 'undefined'}'\x1b[0m`);
}

window.onerror = function(message, source, lineno, colno, error) {
    console.error(`Error: ${message}, Source: ${source}, Line: ${lineno}, Column: ${colno}, Error object: ${error}`);
};
