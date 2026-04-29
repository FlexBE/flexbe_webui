WS.Behaviorlib = new (function() {
	var that = this;

	var behaviorlib = [];


	// Exact lookup by package + behavior name (preferred).
	this.getByKey = function(pkg, behavior_name) {
		return behaviorlib.findElement(function(element) {
			return element.getStatePackage() == pkg && element.getBehaviorName() == behavior_name;
		});
	}

	// Lookup by name only.  Warns if multiple packages define the same name.
	this.getByName = function(behavior_name) {
		var matches = behaviorlib.filter(function(element) {
			return element.getBehaviorName() == behavior_name;
		});
		if (matches.length > 1) {
			T.logWarn("Ambiguous behavior name '" + behavior_name + "' exists in multiple packages: "
				+ matches.map(function(m) { return m.getStatePackage(); }).join(", ")
				+ " — returning first match. Use package-qualified lookup to disambiguate.");
		}
		return matches.length > 0 ? matches[0] : undefined;
	}

	this.getByClass = function(class_name) {
		var matches = behaviorlib.filter(function(element) {
			return element.getStateClass() == class_name;
		});
		if (matches.length > 1) {
			T.logWarn("Ambiguous behavior class '" + class_name + "' exists in multiple packages: "
				+ matches.map(function(m) { return m.getStatePackage(); }).join(", ")
				+ " — returning first match.");
		}
		return matches.length > 0 ? matches[0] : undefined;
	}

	this.getByClassAndPackage = function(pkg, class_name) {
		return behaviorlib.findElement(function(element) {
			return element.getStatePackage() == pkg && element.getStateClass() == class_name;
		});
	}

	this.getBehaviorList = function() {
		list = []
		for (var i=0; i<behaviorlib.length; ++i) {
			list.push(behaviorlib[i]);
		}
		return list.sort(function(a,b) { return a.getBehaviorName().toLowerCase().localeCompare(b.getBehaviorName().toLowerCase()); });
	}

	this.resetLib = function() {
		behaviorlib = [];
	}

	this.addToLib = function(behavior) {
		var pkg = behavior.getStatePackage();
		var name = behavior.getBehaviorName();
		if (that.getByKey(pkg, name) != undefined) {
			T.logWarn("Behavior '" + pkg + "::" + name + "' is already defined — skipping duplicate.");
			return;
		}
		// Warn about cross-package name collision without blocking the add.
		var same_name = behaviorlib.filter(function(e) { return e.getBehaviorName() == name; });
		if (same_name.length > 0) {
			T.logWarn("Behavior name '" + name + "' already defined in package '"
				+ same_name[0].getStatePackage() + "'; also adding from '" + pkg
				+ "'. Use package-qualified lookup (getByKey) to distinguish them.");
		}
		behaviorlib.push(behavior);
	}

	this.updateEntry = function(be_entry, callback) {
		var manifest = be_entry.getBehaviorManifest();
		console.log("WS.BehaviorLib updateEntry for " + manifest.name + " ...")
		// Clear cached content so we re-fetch the latest version
		manifest.codefile_content = "";
		IO.BehaviorLoader.ensureFullContent(manifest, function(full_manifest) {
			if (full_manifest == undefined) {
				if (callback != undefined) callback(undefined);
				return;
			}
			IO.BehaviorLoader.loadBehaviorInterface(full_manifest, function(ifc) {
				if (ifc == undefined) {
					if (callback != undefined) callback(undefined);
					return;
				}
				if (full_manifest.class_name != ifc.class_name) {
					T.logWarn("Inconsistent class name for: " + full_manifest.class_name + " / " + ifc.class_name);
					if (callback != undefined) callback(undefined);
					return;
				}
				behaviorlib.remove(be_entry);
				let updated_entry = new WS.BehaviorStateDefinition(
					full_manifest,
					ifc.smi_outcomes,
					ifc.smi_input,
					ifc.smi_output,
					function() {
						if (callback != undefined) callback(updated_entry);
					}
				);
				behaviorlib.push(updated_entry);
			});
		});
	}

}) ();
