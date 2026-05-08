const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const caseName = process.argv[2];

function loadScript(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(source, { filename: fullPath });
}

function makeElement(id = '') {
  return {
    id,
    style: {},
    disabled: false,
    checked: false,
    value: '',
    innerText: '',
    textContent: '',
    selectedIndex: 0,
    options: [],
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
  };
}

function setupGlobals() {
  const elements = new Map();
  const logs = [];
  const runtimeStatus = [];
  const ocsStatus = [];
  const outcomeRequests = [];
  const feedback = [];
  const subscriberCallbacks = new Map();
  const syncProcesses = new Map();
  const consoleMessages = [];
  const apiGets = [];
  const behaviorLoads = [];
  const behaviorLoadOptions = [];
  let clearLogCalls = 0;
  let syncMirrorCalls = 0;
  const currentStateUpdates = [];

  const originalConsoleLog = console.log;
  console.log = function(...args) {
    consoleMessages.push(args.map(String).join(' '));
  };

  global.window = global;
  global.document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, makeElement(id));
      }
      return elements.get(id);
    },
  };

  global.setTimeout = function(callback) {
    return { callback };
  };
  global.clearTimeout = function() {};

  global.T = {
    logInfo(message) { logs.push({ level: 'info', message: String(message) }); },
    logWarn(message) { logs.push({ level: 'warn', message: String(message) }); },
    logError(message) { logs.push({ level: 'error', message: String(message) }); },
    clearLog() { clearLogCalls += 1; },
    show() {},
    debugWarn() {},
  };

  global.UI = {
    Menu: {
      displayRuntimeStatus(status) { runtimeStatus.push(status); },
      displayOCSStatus(status) { ocsStatus.push(status); },
      isPageStatemachine() { return false; },
    },
    RuntimeControl: {
      displayEngineOffline() {},
      displayNoBehavior() {},
      displayBehaviorConfiguration() {},
      displayExternalBehavior() {},
      displayWaitingForBehavior() {},
      displayLockBehavior() {},
      displayUnlockBehavior() {},
      displayBehaviorChanged() {},
      displayOutcomeRequest(outcome, state) { outcomeRequests.push({ outcome, state }); },
      displayBehaviorFeedback(code, text) { feedback.push({ code, text }); },
      displayState() {},
      refreshView() {},
      resetPauseButton() {},
      setRosProperties() {},
      updateCurrentState(hash) { currentStateUpdates.push(hash); },
      syncMirrorClicked() { syncMirrorCalls += 1; },
      switchPauseButton() {},
      transitionFeedback() {},
      setProgress() {},
      setProgressStatus() {},
    },
    Dashboard: {
      setReadonly() {},
      unsetReadonly() {},
    },
    Panels: {
      SelectBehavior: { hide() {} },
      AddState: { hide() {} },
      StateProperties: {
        hide() {},
        displayStateProperties() {},
        isCurrentState() { return false; },
      },
    },
    Statemachine: {
      refreshView() {},
    },
    Settings: {
      isStopBehaviors() { return false; },
      isSynthesisEnabled() { return false; },
      getSynthesisTopic() { return '/synthesis'; },
      getSynthesisType() { return 'pkg/Action'; },
      isCommandsEnabled() { return false; },
      getCommandsKey() { return ''; },
      getVersion() { return 'test-version'; },
    },
    Tools: {
      notifyRosCommand() {},
      startRosCommand() {},
    },
  };

  global.ActivityTracer = {
    addExecution() {},
    addActivity() {},
  };

  global.Note = function() {};

  const stateMap = new Map();
  const knownState = {
    stateId: -1,
    getStatePath() { return '/known'; },
    getStateId() { return this.stateId; },
    setStateId(id) { this.stateId = id; },
  };
  const rootSm = {
    getStatePath() { return ''; },
    getStateByPath(pathValue) {
      return pathValue === '/known' ? knownState : undefined;
    },
    getStateByName() { return undefined; },
  };

  global.Behavior = {
    behaviorId: undefined,
    manifestPath: '/tmp/demo_manifest.xml',
    getBehaviorId() { return this.behaviorId; },
    setBehaviorId(id) { this.behaviorId = id; },
    getBehaviorName() { return 'DemoBehavior'; },
    getBehaviorPackage() { return 'demo_pkg'; },
    getManifestPath() { return this.manifestPath; },
    getStateMap() { return stateMap; },
    getStatemachine() { return rootSm; },
    createNames() {
      return {
        rosnode_name: 'demo_pkg',
        file_name: 'demo_behavior',
        behavior_name: 'DemoBehavior',
        manifest_path: '/tmp/demo_manifest.xml',
      };
    },
    createStructureInfo() { return {}; },
  };

  global.API = {
    post(_action, _content, callback) { if (callback) callback({ success: true, data: null }); },
    get(action, callback) {
      apiGets.push(action);
      if (callback) callback({ success: false, data: null });
    },
  };
  global.IO = {
    BehaviorLoader: {
      loadBehavior(manifest, _callback, options) {
        behaviorLoads.push(manifest);
        behaviorLoadOptions.push(options);
      },
    },
  };

  global.RC = {};
  loadScript('flexbe_webui/app/rc/rc_sync.js');

  global.ROS = {
    Subscriber: function(topic, msgType, callback) {
      subscriberCallbacks.set(topic, callback);
      this.close = function() {};
    },
    Publisher: function() {
      this.publish = function() {};
      this.close = function() {};
    },
    ActionClient: function() {
      this.close = function() {};
    },
  };

  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/rc/rc_controller.js');
  loadScript('flexbe_webui/app/rc/rc_pubsub.js');

  const originalRegister = RC.Sync.register;
  RC.Sync.register = function(key, timeout) {
    syncProcesses.set(key, { timeout, status: RC.Sync.STATUS_OK, fulfilled: 0 });
    return originalRegister.call(RC.Sync, key, timeout);
  };
  const originalRemove = RC.Sync.remove;
  RC.Sync.remove = function(key) {
    syncProcesses.delete(key);
    return originalRemove.call(RC.Sync, key);
  };
  const originalSetProgress = RC.Sync.setProgress;
  RC.Sync.setProgress = function(key, fulfilled, relative) {
    const process = syncProcesses.get(key);
    if (process) {
      process.fulfilled = (relative ? process.fulfilled : 0) + fulfilled;
      process.fulfilled = Math.min(Math.max(process.fulfilled, 0), 1);
    }
    return originalSetProgress.call(RC.Sync, key, fulfilled, relative);
  };
  const originalSetStatus = RC.Sync.setStatus;
  RC.Sync.setStatus = function(key, newStatus) {
    const process = syncProcesses.get(key);
    if (process) {
      process.status = newStatus;
    }
    return originalSetStatus.call(RC.Sync, key, newStatus);
  };

  return {
    logs,
    runtimeStatus,
    ocsStatus,
    outcomeRequests,
    feedback,
    subscriberCallbacks,
    syncProcesses,
    stateMap,
    knownState,
    apiGets,
    behaviorLoads,
    behaviorLoadOptions,
    currentStateUpdates,
    getSyncMirrorCalls() { return syncMirrorCalls; },
    consoleMessages,
    getClearLogCalls() { return clearLogCalls; },
    restoreConsole() {
      console.log = originalConsoleLog;
    },
  };
}

function initializeRcHarness() {
  const context = setupGlobals();
  RC.Controller.initialize();
  RC.PubSub.initialize('/test/');
  return context;
}

function runHeartbeatOrderingCase() {
  const context = initializeRcHarness();
  try {
    assert.strictEqual(RC.Controller.isConnected(), false);
    const heartbeat = context.subscriberCallbacks.get('/test/flexbe/heartbeat');
    assert(heartbeat);
    heartbeat({ behavior_id: 0 });
    assert.strictEqual(RC.Controller.isConnected(), false);
    assert.strictEqual(context.syncProcesses.has('Delay'), false);
    assert.strictEqual(context.runtimeStatus.includes('offline'), true);
  } finally {
    context.restoreConsole();
  }
}

function runSessionRestoreIdleHeartbeatCase() {
  const context = initializeRcHarness();
  try {
    Behavior.manifestPath = undefined;
    const heartbeat = context.subscriberCallbacks.get('/test/flexbe/heartbeat');
    assert(heartbeat);

    heartbeat({ behavior_id: 0 });

    assert.deepStrictEqual(context.apiGets, ['session/loaded_behavior']);
    assert.deepStrictEqual(context.behaviorLoads, []);
  } finally {
    context.restoreConsole();
  }
}

function runSessionRestoreStoppedHeartbeatCase() {
  const context = initializeRcHarness();
  try {
    Behavior.manifestPath = undefined;
    API.get = function(action, callback) {
      context.apiGets.push(action);
      callback({
        success: true,
        data: {
          package: 'demo_pkg',
          behavior_name: 'DemoBehavior',
          manifest_path: '/tmp/demo.xml',
          codefile_name: 'demo_behavior_sm.py',
          editable: true,
        },
      });
    };

    const heartbeat = context.subscriberCallbacks.get('/test/flexbe/heartbeat');
    assert(heartbeat);
    heartbeat({ behavior_id: 0 });

    assert.deepStrictEqual(context.apiGets, ['session/loaded_behavior']);
    assert.strictEqual(context.behaviorLoads.length, 1);
    assert.deepStrictEqual(context.behaviorLoads[0], {
      rosnode_name: 'demo_pkg',
      name: 'DemoBehavior',
      manifest_path: '/tmp/demo.xml',
      codefile_name: 'demo_behavior_sm.py',
      editable: true,
    });
    assert.deepStrictEqual(context.behaviorLoadOptions[0], { clear_session: false, clear_terminal: false });
    assert.strictEqual(context.getClearLogCalls(), 0);
  } finally {
    context.restoreConsole();
  }
}

function runSessionRestoreActiveHeartbeatCase() {
  const context = initializeRcHarness();
  try {
    Behavior.manifestPath = undefined;
    API.get = function(action, callback) {
      context.apiGets.push(action);
      callback({
        success: true,
        data: {
          package: 'demo_pkg',
          behavior_name: 'DemoBehavior',
          manifest_path: '/tmp/demo.xml',
          codefile_name: 'demo_behavior_sm.py',
        },
      });
    };

    const heartbeat = context.subscriberCallbacks.get('/test/flexbe/heartbeat');
    assert(heartbeat);
    heartbeat({ behavior_id: 99 });

    assert.deepStrictEqual(context.apiGets, ['session/loaded_behavior']);
    assert.strictEqual(context.behaviorLoads.length, 1);
    assert.deepStrictEqual(context.behaviorLoads[0], {
      rosnode_name: 'demo_pkg',
      name: 'DemoBehavior',
      manifest_path: '/tmp/demo.xml',
      codefile_name: 'demo_behavior_sm.py',
      editable: true,
    });
    assert.deepStrictEqual(context.behaviorLoadOptions[0], { clear_session: false, clear_terminal: false });
  } finally {
    context.restoreConsole();
  }
}

function runOutcomeOrderingCase() {
  const context = initializeRcHarness();
  try {
    const outcomeRequest = context.subscriberCallbacks.get('/test/flexbe/outcome_request');
    assert(outcomeRequest);
    outcomeRequest({ target: 99, outcome: 2 });
    assert.deepStrictEqual(context.outcomeRequests, []);
    assert(context.consoleMessages.some(message => message.includes("Outcome request arrived before state map is ready")));
  } finally {
    context.restoreConsole();
  }
}

function runStatusOrderingCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Controller.updateCurrentStatePath('/known');
    RC.Controller.signalRunning();
    RC.Controller.signalLocked();

    let unlockTarget;
    RC.PubSub.sendBehaviorUnlock = function(pathValue) {
      unlockTarget = pathValue;
    };

    const behaviorStatus = context.subscriberCallbacks.get('/test/flexbe/status');
    assert(behaviorStatus);
    assert.doesNotThrow(() => {
      behaviorStatus({ code: 0, args: ['/missing'] });
    });
    assert.strictEqual(unlockTarget, undefined);
  } finally {
    context.restoreConsole();
  }
}

function runStateMapOrderingCase() {
  const context = initializeRcHarness();
  try {
    context.stateMap.set(5, { path: '/stale', state: { getStatePath() { return '/stale'; } } });
    Behavior.setBehaviorId(11);

    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Controller.updateCurrentStatePath('/known');
    RC.Controller.signalRunning();
    RC.Controller.signalLocked();

    const stateMapCallback = context.subscriberCallbacks.get('/test/flexbe/mirror/state_map');
    assert(stateMapCallback);
    stateMapCallback({
      behavior_id: 42,
      state_ids: [0, 7],
      state_paths: ['', '/known'],
    });

    assert.strictEqual(Behavior.getBehaviorId(), 42);
    assert.strictEqual(context.stateMap.get(0).path, '');
    assert.strictEqual(context.stateMap.get(7).path, '/known');
    assert.strictEqual(context.knownState.getStateId(), 7);
    assert.strictEqual(context.stateMap.has(5), false);
  } finally {
    context.restoreConsole();
  }
}

function runStateMapRequiresLoadedManifestCase() {
  const context = initializeRcHarness();
  try {
    Behavior.manifestPath = undefined;
    Behavior.getBehaviorName = function() { return ''; };
    context.stateMap.set(5, { path: '/stale', state: { getStatePath() { return '/stale'; } } });
    Behavior.setBehaviorId(11);

    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Controller.signalRunning();

    const stateMapCallback = context.subscriberCallbacks.get('/test/flexbe/mirror/state_map');
    assert(stateMapCallback);
    stateMapCallback({
      behavior_id: 42,
      state_ids: [0, 7],
      state_paths: ['', '/known'],
    });

    assert.strictEqual(Behavior.getBehaviorId(), 11);
    assert.strictEqual(context.stateMap.has(5), true);
    assert.strictEqual(context.stateMap.has(7), false);
    assert(context.consoleMessages.some(message => message.includes('no behavior loaded')));
  } finally {
    context.restoreConsole();
  }
}

function runStateMapReplaysPendingStateCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Controller.signalRunning();

    const currentStateCallback = context.subscriberCallbacks.get('/test/flexbe/behavior_update');
    assert(currentStateCallback);
    currentStateCallback({ data: 1792 });

    const stateMapCallback = context.subscriberCallbacks.get('/test/flexbe/mirror/state_map');
    assert(stateMapCallback);
    stateMapCallback({
      behavior_id: 42,
      state_ids: [0, 1792],
      state_paths: ['', '/known'],
    });

    assert.deepStrictEqual(context.currentStateUpdates, [1792, 1792]);
    assert.strictEqual(context.knownState.getStateId(), 1792);
  } finally {
    context.restoreConsole();
  }
}

function runReadyOrderingCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalBehavior();
    assert.strictEqual(RC.Controller.isConnected(), false);

    const behaviorStatus = context.subscriberCallbacks.get('/test/flexbe/status');
    assert(behaviorStatus);
    behaviorStatus({ code: 20, args: [] });

    assert.strictEqual(RC.Controller.isConnected(), true);
    assert(context.feedback.some(entry => entry.text === 'Onboard engine is ready.'));
    assert(context.runtimeStatus.includes('online'));
  } finally {
    context.restoreConsole();
  }
}

function runSwitchOrderingCase() {
  const context = initializeRcHarness();
  try {
    let signalStartedCalls = 0;
    RC.Controller.signalStarted = function() {
      signalStartedCalls += 1;
    };

    const startButton = document.getElementById('button_behavior_start');
    startButton.disabled = false;

    assert.doesNotThrow(() => {
      RC.PubSub.sendBehaviorUpdate(['/alpha'], ['1'], 2);
    });

    assert.strictEqual(signalStartedCalls, 0);
    assert.strictEqual(startButton.disabled, false);
    assert(context.syncProcesses.has('Switch'));
  } finally {
    context.restoreConsole();
  }
}

function runLaunchBlockedStartCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Sync.register('BehaviorStart', 60);

    const commandFeedback = context.subscriberCallbacks.get('/test/flexbe/command_feedback');
    assert(commandFeedback);
    commandFeedback({ command: 'launch', args: ['blocked', 'not_ready'] });

    assert.strictEqual(RC.Controller.isConnected(), true);
    assert.strictEqual(RC.Controller.isRunning(), false);
    assert.strictEqual(document.getElementById('button_behavior_start').disabled, false);
    assert.strictEqual(context.syncProcesses.has('BehaviorStart'), false);
    assert(context.feedback.some(entry => entry.text.includes('not ready for a new behavior')));
  } finally {
    context.restoreConsole();
  }
}

function runLaunchBlockedSwitchCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalConnected();
    RC.Controller.signalBehavior();
    RC.Controller.signalStarted();
    RC.Controller.updateCurrentStatePath('/known');
    RC.Controller.signalRunning();
    RC.Sync.register('Switch', 70);

    const commandFeedback = context.subscriberCallbacks.get('/test/flexbe/command_feedback');
    assert(commandFeedback);
    commandFeedback({ command: 'launch', args: ['blocked', 'not_ready'] });

    assert.strictEqual(RC.Controller.isRunning(), true);
    assert.strictEqual(context.syncProcesses.get('Switch').status, RC.Sync.STATUS_ERROR);
    assert.strictEqual(context.syncProcesses.get('Switch').fulfilled, 1);
    assert(context.feedback.some(entry => entry.text.includes('not ready for a new behavior')));
  } finally {
    context.restoreConsole();
  }
}

function runAttachSuccessRequestsSyncCase() {
  const context = initializeRcHarness();
  try {
    RC.Controller.signalConnected();
    RC.Controller.signalExternal();
    RC.Controller.signalBehavior();
    RC.Sync.register('Attach', 30);

    const commandFeedback = context.subscriberCallbacks.get('/test/flexbe/command_feedback');
    assert(commandFeedback);
    commandFeedback({ command: 'attach', args: ['DemoBehavior', '3'] });

    assert.strictEqual(RC.Controller.isRunning(), true);
    assert.strictEqual(context.syncProcesses.has('Attach'), false);
    assert.strictEqual(context.getSyncMirrorCalls(), 1);
    assert.strictEqual(document.getElementById('selection_rc_autonomy').value, 3);
  } finally {
    context.restoreConsole();
  }
}

function main() {
  const cases = {
    heartbeat_ordering: runHeartbeatOrderingCase,
    session_restore_idle_heartbeat: runSessionRestoreIdleHeartbeatCase,
    session_restore_stopped_heartbeat: runSessionRestoreStoppedHeartbeatCase,
    session_restore_active_heartbeat: runSessionRestoreActiveHeartbeatCase,
    outcome_ordering: runOutcomeOrderingCase,
    status_ordering: runStatusOrderingCase,
    state_map_ordering: runStateMapOrderingCase,
    state_map_requires_loaded_manifest: runStateMapRequiresLoadedManifestCase,
    state_map_replays_pending_state: runStateMapReplaysPendingStateCase,
    ready_ordering: runReadyOrderingCase,
    switch_ordering: runSwitchOrderingCase,
    launch_blocked_start: runLaunchBlockedStartCase,
    launch_blocked_switch: runLaunchBlockedSwitchCase,
    attach_success_requests_sync: runAttachSuccessRequestsSyncCase,
  };

  if (caseName) {
    if (!cases[caseName]) {
      throw new Error(`Unknown case '${caseName}'`);
    }
    cases[caseName]();
    return;
  }

  Object.values(cases).forEach(runCase => runCase());
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exit(1);
}
