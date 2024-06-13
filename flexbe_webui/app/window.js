window.onload = async () => {
	Behavior.resetBehavior();

	// Initialize gui panel
	UI.Statemachine.initialize();
	UI.Menu.toDashboardClicked();
	UI.Dashboard.resetAllFields();
	UI.Dashboard.addBehaviorOutcome('finished');
	UI.Dashboard.addBehaviorOutcome('failed');
	ActivityTracer.resetActivities();
	UI.RuntimeControl.displayLockBehavior();

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
			console.log(`Calling RC.ROS.trySetupConnection ...`);
			RC.ROS.trySetupConnection();
		} else {
			RC.ROS.setOfflineMode();
			T.logInfo("Running in offline mode; restart using server if ROS connection is required.");
			UI.Settings.setRosProperties('');
			UI.RuntimeControl.setRosProperties('');
		}
	});

	// Restore local settings (including statelib)
	UI.Settings.retrieveConfigurationSettings();
	UI.Settings.retrievePackageData();
	console.log("  initialize feed ...");
	UI.Feed.initialize();

	// Capture the beforeunload event to confirm shutdown
	window.addEventListener('beforeunload', function (event) {
		// Call the custom confirm function
		var confirmExit = UI.Tools.confirmUIExit();
		if (!confirmExit) {
			// Prevent the default action (closing the window)
			event.preventDefault();
		}
	});

}
