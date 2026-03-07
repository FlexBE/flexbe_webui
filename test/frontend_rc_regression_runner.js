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
    clearLog() {},
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
      updateCurrentState() {},
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
    getBehaviorId() { return this.behaviorId; },
    setBehaviorId(id) { this.behaviorId = id; },
    getBehaviorName() { return 'DemoBehavior'; },
    getBehaviorPackage() { return 'demo_pkg'; },
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
    consoleMessages,
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

function runOutcomeOrderingCase() {
  const context = initializeRcHarness();
  try {
    const outcomeRequest = context.subscriberCallbacks.get('/test/flexbe/outcome_request');
    assert(outcomeRequest);
    outcomeRequest({ target: 99, outcome: 2 });
    assert.deepStrictEqual(context.outcomeRequests, []);
    assert(context.consoleMessages.some(message => message.includes("cannot find state for '99'")));
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

function main() {
  const cases = {
    heartbeat_ordering: runHeartbeatOrderingCase,
    outcome_ordering: runOutcomeOrderingCase,
    status_ordering: runStatusOrderingCase,
    state_map_ordering: runStateMapOrderingCase,
    ready_ordering: runReadyOrderingCase,
    switch_ordering: runSwitchOrderingCase,
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
