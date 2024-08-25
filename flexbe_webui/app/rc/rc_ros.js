RC.ROS = new (function() {
	var that = this;

	var connected = false;
	var trying = false;
	var stopping = false;
	var offline = false;
	var namespace = "";

	this.getROS = function() {
		return undefined;
	}

	var setupConnection = function(node_namespace) {
		if (node_namespace == undefined) return;
		namespace = node_namespace;
		T.logInfo("ROS connection running!");
		UI.Settings.setRosProperties(namespace);
		UI.RuntimeControl.setRosProperties(namespace);

		// at first, not connected to the behavior engine
		// will change as soon as we get any message from the onboard be
		UI.Menu.displayRuntimeStatus("disconnected");
		UI.Menu.displayOCSStatus("disconnected");
		RC.Sync.register("ROS", 90);
		RC.Sync.setStatus("ROS", RC.Sync.STATUS_ERROR);

		RC.PubSub.initialize(namespace);
		trying = false;
		stopping = false;
		connected = true;
		UI.Settings.setRosProperties(namespace);
		UI.RuntimeControl.setRosProperties(namespace);
	}

	this.setOfflineMode = function() {
		offline = true;
	}

	this.isOfflineMode = function() {
		return offline;
	}


	this.trySetupConnection = function() {
		if (offline) {
			T.logError("Offline mode - cannot open ROS connections!");
			return;
		}
		T.logInfo("Setting up ROS connection ...");
		trying = true;
		UI.Settings.setRosProperties('');
		UI.RuntimeControl.setRosProperties('');

		ROS.init(setupConnection);
		T.logInfo("Done ROS connection setup!");
		trying = false;
	}

	this.closeConnection = function() {
		T.logInfo("Closing ROS connection...");
		trying = false;
		stopping = true;
		UI.Settings.setRosProperties('');
		UI.RuntimeControl.setRosProperties('');
		RC.PubSub.shutdown();
		connected = false;

		RC.Controller.signalDisconnected();
		RC.Sync.remove("ROS");
		RC.Sync.shutdown();
		ROS.shutdown();
		UI.Menu.displayRuntimeStatus("offline");
		UI.Menu.displayOCSStatus("offline");
		T.logInfo("ROS connection closed!");
		stopping = false;
		UI.Settings.setRosProperties('');
		UI.RuntimeControl.setRosProperties('');
	}

	this.isConnected = function() {
		return connected;
	}

	this.isTrying = function() {
		return trying;
	}

	this.isStopping = function() {
		return stopping;
	}

}) ();