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
  const listeners = new Map();
  return {
    id,
    style: {},
    classList: {
      toggle() {},
    },
    children: [],
    innerHTML: '',
    innerText: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    selectedIndex: 0,
    options: [],
    parentNode: { removeChild() {} },
    appendChild(child) {
      child.parentNode = this;
      child.parentElement = this;
      this.children.push(child);
      this.options.push(child);
      return child;
    },
    insertBefore(child, referenceChild) {
      child.parentNode = this;
      child.parentElement = this;
      const existingChildIndex = this.children.indexOf(child);
      if (existingChildIndex !== -1) {
        this.children.splice(existingChildIndex, 1);
      }
      const existingOptionIndex = this.options.indexOf(child);
      if (existingOptionIndex !== -1) {
        this.options.splice(existingOptionIndex, 1);
      }
      const referenceIndex = this.children.indexOf(referenceChild);
      if (referenceIndex === -1) {
        this.children.push(child);
        this.options.push(child);
      } else {
        this.children.splice(referenceIndex, 0, child);
        this.options.splice(referenceIndex, 0, child);
      }
      return child;
    },
    removeChild(child) {
      const childIndex = this.children.indexOf(child);
      if (childIndex !== -1) {
        this.children.splice(childIndex, 1);
      }
      const optionIndex = this.options.indexOf(child);
      if (optionIndex !== -1) {
        this.options.splice(optionIndex, 1);
      }
      if (child) {
        if (typeof document !== 'undefined' && document.unregisterElement) {
          document.unregisterElement(child);
        }
        child.parentNode = undefined;
        child.parentElement = undefined;
      }
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    getAttribute(name) {
      return this[name];
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) {
        return;
      }
      listeners.set(type, listeners.get(type).filter(entry => entry !== handler));
    },
    focus() {},
    blur() {},
    dispatchEvent(event) {
      if (typeof event.preventDefault !== 'function') {
        event.preventDefault = function() {
          this.defaultPrevented = true;
        };
      }
      if (typeof event.stopPropagation !== 'function') {
        event.stopPropagation = function() {
          this.propagationStopped = true;
        };
      }
      if (typeof event.stopImmediatePropagation !== 'function') {
        event.stopImmediatePropagation = function() {
          this.immediatePropagationStopped = true;
          this.propagationStopped = true;
        };
      }
      if (event.target === undefined) {
        event.target = this;
      }
      const handlers = listeners.get(event.type) || [];
      for (const handler of handlers) {
        handler.call(this, event);
        if (event.immediatePropagationStopped) {
          break;
        }
      }
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 20 };
    },
    setSelectionRange() {},
  };
}

function setupGlobals() {
  const logs = [];
  const elements = new Map();
  const feedMessages = [];
  const acknowledgements = [];
  const consoleMessages = [];
  const localStorageData = new Map();
  let strictElementLookup = false;

  global.window = global;
  global.Mousetrap = {
    bind() {},
  };
  global.localStorage = {
    setItem(key, value) {
      localStorageData.set(key, String(value));
    },
    getItem(key) {
      return localStorageData.has(key) ? localStorageData.get(key) : null;
    },
    removeItem(key) {
      localStorageData.delete(key);
    },
  };
  global.document = {
    body: makeElement('body'),
    documentElement: {
      style: {
        setProperty() {},
      },
    },
    activeElement: { blur() {} },
    getElementById(id) {
      if (!elements.has(id)) {
        if (strictElementLookup) {
          return undefined;
        }
        elements.set(id, makeElement(id));
      }
      return elements.get(id);
    },
    unregisterElement(element) {
      if (element == undefined) {
        return;
      }
      if (element.id !== '' && elements.get(element.id) === element) {
        elements.delete(element.id);
      }
      (element.children || []).forEach(child => {
        this.unregisterElement(child);
      });
    },
    setStrictElementLookup(enabled) {
      strictElementLookup = enabled;
    },
    createElement() {
      const element = makeElement();
      let elementId = '';
      Object.defineProperty(element, 'id', {
        configurable: true,
        enumerable: true,
        get() {
          return elementId;
        },
        set(value) {
          if (elementId !== '' && elements.get(elementId) === this) {
            elements.delete(elementId);
          }
          elementId = value;
          if (value !== '' && value !== undefined) {
            elements.set(value, this);
          }
        },
      });
      const baseSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        baseSetAttribute.call(this, name, value);
        if (name === 'id') {
          elements.set(value, this);
        }
      };
      const baseRemoveAttribute = element.removeAttribute;
      element.removeAttribute = function(name) {
        if (name === 'id' && elementId !== '' && elements.get(elementId) === this) {
          elements.delete(elementId);
          elementId = '';
        }
        baseRemoveAttribute.call(this, name);
      };
      return element;
    },
    createTextNode(text) {
      return { textContent: text };
    },
    getElementsByTagName() {
      return [this.body];
    },
    addEventListener() {},
  };

  global.Event = function(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  };
  global.CustomEvent = function(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    Object.assign(this, options);
  };

  global.T = {
    logInfo(message) { logs.push({ level: 'info', message: String(message) }); },
    logError(message) { logs.push({ level: 'error', message: String(message) }); },
    logWarn(message) { logs.push({ level: 'warn', message: String(message) }); },
    debugWarn() {},
    clearLog() {},
  };

  global.Tools = {
    viewed: [],
    viewSource(name, file, text) {
      this.viewed.push({ name, file, text });
    },
    autoconnect() {},
    groupSelection() {},
  };

  global.UI = {
    Panels: {
      Terminal: {
        show() {},
        hide() {},
      },
    },
    Feed: {
      displayCustomMessage(id, severity, title, content) {
        feedMessages.push({ id, severity, title, content });
      },
      initialize() {},
    },
    Tools: {
      notifyRosCommand() {},
      customAcknowledge(message) {
        acknowledgements.push(String(message));
        return Promise.resolve();
      },
    },
    Dashboard: {
      removeTabHandling() {},
      setupTabHandling() {},
    },
    RuntimeControl: {
      removeTabHandling() {},
      setupTabHandling() {},
      setRosProperties() {},
    },
    Statemachine: {
      setupTabHandling() {},
      isReadonly() { return false; },
      toggleDataflow() {},
      toggleComments() {},
      toggleOutcomes() {},
    },
    Settings: {
      getCodeIndentation() { return '    '; },
      isExplicitStates() { return false; },
      updateBehaviorlib() {},
      getEditorCommand() { return 'code'; },
      getSynthesisTopic() { return '/flexbe_synthesis'; },
      getSynthesisType() { return 'flexbe_synthesis_msgs/FlexBESynthesis'; },
      getSynthesisSystem() { return 'coffee_maker'; },
      setRosProperties() {},
      removeTabHandling() {},
      setupTabHandling() {},
    },
    Menu: {},
  };

  global.ActivityTracer = {
    hasUnsavedChanges() { return false; },
    undo() {},
    redo() {},
    resetToSave() {},
  };

  global.WS = {
    Statelib: {
      resetLib() {},
      addToLib() {},
      getFromLib() { return undefined; },
      isClassUnique() { return true; },
    },
    Behaviorlib: {
      resetLib() {},
      addToLib() {},
      getByName() { return undefined; },
      getByKey() { return undefined; },
      getByClassAndPackage() { return undefined; },
      getBehaviorList() { return []; },
    },
    BehaviorStateDefinition: function(behaviorData) {
      this.behaviorData = behaviorData;
    },
  };

  global.IO = {
    StateParser: {
      parseState(stateData) { return stateData; },
    },
    BehaviorLoader: {
      loadBehaviorInterface(behaviorData, callback) {
        callback({ smi_outcomes: [], smi_input: [], smi_output: [] });
      },
    },
  };

  global.RC = {
    ROS: {
      setOfflineMode() {},
      trySetupConnection() {},
      isConnected() { return false; },
    },
    Controller: {
      initialize() {},
    },
    PubSub: {
      shutdown() {},
      initializeSynthesisAction() {},
    },
  };

  global.CommandLib = {
    load() { return []; },
  };

  global.Behavior = {
    file_name: undefined,
    manifest_path: undefined,
    behavior_package: 'pkg_a',
    getBehaviorName() { return 'Demo'; },
    getStatemachine() {
      return {
        getStates() {
          return [{ getStateClass() { return 'SimpleState'; } }];
        },
      };
    },
    createNames() {
      return {
        rosnode_name: 'pkg_a',
        file_name: 'demo_behavior',
        behavior_name: 'DemoBehavior',
        manifest_path: '/tmp/demo_manifest',
      };
    },
    setFiles(pythonFile, manifestPath) {
      this.file_name = pythonFile;
      this.manifest_path = manifestPath;
    },
    setBehaviorPackage(pkg) {
      this.behavior_package = pkg;
    },
    getBehaviorPackage() {
      return this.behavior_package;
    },
  };

  global.Statemachine = function() {};
  global.BehaviorState = function() {};
  global.chooseFile = async function(_folder, files) {
    return files[0] || null;
  };

  global.API = {
    post(_action, _content, callback) { if (callback) callback({ success: true, data: null }); },
    get(_action, callback) { if (callback) callback({ success: false, data: null }); },
    getData(_action, _callback) {},
    postData(_action, _content, _onSuccess) {},
  };

  const originalConsoleLog = console.log;
  console.log = function(...args) {
    consoleMessages.push(args.map(value => String(value)).join(' '));
  };

  return {
    logs,
    elements,
    feedMessages,
    acknowledgements,
    consoleMessages,
    restoreConsole() {
      console.log = originalConsoleLog;
    },
  };
}

function assertLog(logs, level, fragment) {
  assert(
    logs.some(entry => entry.level === level && entry.message.includes(fragment)),
    `Expected ${level} log containing '${fragment}', got ${JSON.stringify(logs, null, 2)}`
  );
}

function flattenElementText(node) {
  if (node == undefined) {
    return '';
  }
  let text = node.textContent || '';
  (node.children || []).forEach(function(child) {
    text += flattenElementText(child);
  });
  return text;
}

async function runBehaviorSaverCase() {
  const { logs, feedMessages } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  let lastPostContent;
  global.API = {
    postData(_action, content, onSuccess, _onError) {
      lastPostContent = content;
      onSuccess({
        install_success: true,
        python_file_name: 'generated_behavior',
        manifest_file_path: '/tmp/generated_manifest.xml',
        src_save_success: true,
        src_error_msg: '',
      });
    },
  };

  loadScript('flexbe_webui/app/io/io_behaviorsaver.js');
  IO.BehaviorSaver.saveStateMachine({ save_as: true });

  assert.strictEqual(global.Behavior.file_name, 'generated_behavior');
  assert.strictEqual(global.Behavior.manifest_path, '/tmp/generated_manifest.xml');
  assertLog(logs, 'info', 'Behavior code generation completed.');
  assertLog(logs, 'info', 'Save behavior was successful!');

  logs.length = 0;
  global.Behavior.getStatemachine = function() {
    const pkgABehavior = new global.BehaviorState();
    pkgABehavior.getStateClass = () => 'SharedSM';
    pkgABehavior.getBehaviorName = () => 'SharedBehavior';
    pkgABehavior.getStatePackage = () => 'pkg_a';

    const pkgBBehavior = new global.BehaviorState();
    pkgBBehavior.getStateClass = () => 'SharedSM';
    pkgBBehavior.getBehaviorName = () => 'SharedBehavior';
    pkgBBehavior.getStatePackage = () => 'pkg_b';

    return {
      getStates() {
        return [pkgABehavior, pkgBBehavior];
      },
    };
  };

  IO.BehaviorSaver.saveStateMachine({ save_as: true });
  assert.deepStrictEqual(lastPostContent.behavior_names, [
    { name: 'SharedBehavior', package: 'pkg_a' },
    { name: 'SharedBehavior', package: 'pkg_b' },
  ]);

  logs.length = 0;
  global.API.postData = function(_action, _content, _onSuccess, onError) {
    onError('transport failed');
  };

  IO.BehaviorSaver.saveStateMachine({ save_as: true });
  assertLog(logs, 'error', 'Failed to save the behavior.');
  assertLog(logs, 'info', 'transport failed');

  logs.length = 0;
  feedMessages.length = 0;
  global.API.postData = function(_action, _content, onSuccess, _onError) {
    onSuccess({
      install_success: true,
      python_file_name: 'generated_behavior',
      manifest_file_path: '/tmp/generated_manifest.xml',
      src_save_success: false,
      src_error_msg: '',
    });
  };

  IO.BehaviorSaver.saveStateMachine({ save_as: true });
  assertLog(logs, 'warn', 'Saved to install space only; source save is disabled.');
  assertLog(logs, 'info', 'Create a manual backup if you need to preserve it outside the install space.');
  assert.strictEqual(feedMessages.length, 0);

  logs.length = 0;
  feedMessages.length = 0;
  global.API.postData = function(_action, _content, onSuccess, _onError) {
    onSuccess({
      install_success: true,
      python_file_name: 'generated_behavior',
      manifest_file_path: '/tmp/generated_manifest.xml',
      src_save_success: false,
      src_error_msg: 'source folder missing',
    });
  };

  IO.BehaviorSaver.saveStateMachine({ save_as: true });
  assertLog(logs, 'warn', 'Saved to install space, but failed to save to source folder.');
  assertLog(logs, 'info', 'source folder missing');
  assert.deepStrictEqual(feedMessages[0], {
    id: 'msg_source_save_warning',
    severity: 1,
    title: 'Source Save Warning',
    content: 'Saved to install space, but failed to save to source folder.\nsource folder missing',
  });
}

async function runSettingsCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/ui_settings.js');

  const baseConfiguration = {
    code_indentation: 2,
    collapse_info: false,
    collapse_warn: false,
    collapse_error: false,
    collapse_hint: false,
    commands_enabled: false,
    commands_key: '',
    default_package: 'pkg_behaviors',
    dashboard_text_size: 86.5,
    dashboard_text_bold: false,
    statemachine_text_size: 86.5,
    statemachine_text_bold: true,
    statemachine_text_extra_bold: false,
    transition_line_width_normal: 2.0,
    transition_line_width_bold: 3.0,
    transition_line_width_extra_bold: 4.0,
    allow_editors: [],
    editor_command: 'code',
    explicit_states: false,
    gridsize: 50,
    license: 'Apache-2',
    license_file: '',
    pkg_cache_enabled: false,
    runtime_timeout: 10,
    server_timeout: 0.25,
    save_in_source: true,
    source_code_root: '',
    stop_behaviors: false,
    synthesis_enabled: false,
    synthesis_topic: '',
    synthesis_type: '',
    synthesis_system: '',
    text_encoding: 'utf-8',
    transition_mode: 0,
  };

  global.API = {
    postData(action, _content, onSuccess, _onError) {
      if (action === 'get_config_settings') {
        onSuccess({ configuration: baseConfiguration });
        return;
      }
      onSuccess(true, { success: true, data: true, error: null, status: 200 });
    },
    getDataAsync(_action) {
      return Promise.reject({ error: 'config files unavailable' });
    },
    getData(action, onSuccess, onError) {
      if (action === 'packages/states') {
        onSuccess([{ name: 'pkg_states', path: '/tmp/pkg_states' }]);
        return;
      }
      if (action === 'packages/behaviors') {
        onSuccess([{ name: 'pkg_behaviors', path: '/tmp/pkg_behaviors' }]);
        return;
      }
      if (action.startsWith('io/states/')) {
        onSuccess({ items: [], errors: ['state definition fetch failed'] });
        return;
      }
      if (action.startsWith('io/behaviors/')) {
        onSuccess({ items: [], errors: ['behavior definition fetch failed'] });
        return;
      }
      onError(`unexpected action ${action}`);
    },
  };

  await UI.Settings.importConfiguration();
  assertLog(logs, 'error', 'Cannot retrieve available configuration files!');

  logs.length = 0;
  await UI.Settings.exportConfiguration();
  assertLog(logs, 'error', 'Cannot retrieve available configuration files!');

  logs.length = 0;
  const licenseField = document.getElementById('custom_license_file');
  licenseField.disabled = true;
  global.API.postData = function(action, _content, onSuccess, _onError) {
    if (action === 'get_config_settings') {
      onSuccess({
        configuration: {
          ...baseConfiguration,
          license: 'CUSTOM',
          license_file: '/tmp/custom-license.txt',
        },
      });
      return;
    }
    onSuccess(true, { success: true, data: true, error: null, status: 200 });
  };
  UI.Settings.retrieveConfigurationSettings({});
  assert.strictEqual(document.getElementById('select_license').value, 'CUSTOM');
  assert.strictEqual(licenseField.disabled, false);
  assert.strictEqual(licenseField.value, '/tmp/custom-license.txt');

  global.API.postData = function(action, _content, onSuccess, _onError) {
    if (action === 'get_config_settings') {
      const partialConfiguration = { ...baseConfiguration };
      delete partialConfiguration.license;
      delete partialConfiguration.text_encoding;
      onSuccess({ configuration: partialConfiguration });
      return;
    }
    onSuccess(true, { success: true, data: true, error: null, status: 200 });
  };
  UI.Settings.retrieveConfigurationSettings({});
  assert.strictEqual(document.getElementById('select_license').value, 'APACHE-2');
  assert.strictEqual(document.getElementById('select_encoding').value, 'UTF-8');

  logs.length = 0;
  const gridInput = document.getElementById('input_gridsize');
  gridInput.value = '';
  UI.Settings.gridsizeChanged();
  assert.strictEqual(gridInput.value, 50);

  gridInput.value = '-5';
  UI.Settings.gridsizeChanged();
  assert.strictEqual(gridInput.value, 10);

  gridInput.value = '500';
  UI.Settings.gridsizeChanged();
  assert.strictEqual(gridInput.value, 200);

  logs.length = 0;
  global.API.postData = function(_action, _content, onSuccess, _onError) {
    onSuccess(true, { success: true, data: true, error: null, status: 200 });
  };
  UI.Settings.retrievePackageData();
  assertLog(logs, 'warn', "State library warning for 'pkg_states': state definition fetch failed");
  assertLog(logs, 'warn', "Behavior library warning for 'pkg_behaviors': behavior definition fetch failed");

  gridInput.value = '70';
  UI.Settings.gridsizeChanged();
  assert.strictEqual(gridInput.value, 70);
}

async function runMenuCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/ui_tools.js');
  loadScript('flexbe_webui/app/ui/ui_menu.js');

  global.API = {
    postFlag(_action, _content, _onSuccess, onError) {
      onError('editor open failed');
    },
    postData(_action, _content, _onSuccess, onError) {
      onError('source view failed');
    },
  };

  UI.Menu.scEditClicked();
  UI.Menu.scViewClicked();

  assertLog(logs, 'error', 'editor open failed');
  assertLog(logs, 'error', 'source view failed');
}

async function runMenuAutoLayoutButtonCase() {
  setupGlobals();

  let autoLayoutCount = 0;
  UI.Panels.hideAllPanels = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Statemachine.requestAutoLayout = function() {
    autoLayoutCount += 1;
  };
  T.hide = function() {};

  ['dashboard', 'statemachine', 'runtimecontrol', 'settings'].forEach(id => {
    document.getElementById(id).parentElement = { offsetWidth: 1000 };
  });

  loadScript('flexbe_webui/app/ui/ui_menu.js');
  UI.Menu.setFocus = function() {};

  UI.Menu.toStatemachineClicked();

  const button = document.getElementById('tool_button Auto Layout');
  assert(button, 'Expected Auto Layout button on statemachine toolbar');
  button.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(autoLayoutCount, 1);
}

async function runActionClientCase() {
  const { logs } = setupGlobals();
  global.ROS = {};
  global.json_parse_raw = function(text) {
    return [JSON.parse(text), text.length];
  };
  loadScript('flexbe_webui/app/ros/ros_actionclient.js');

  let successResult = 'unset';
  global.API = {
    postFlag(_action, _content, onSuccess, _onError) {
      onSuccess({ ok: true }, { success: true, data: { ok: true }, error: null, status: 200 });
    },
    postData(_action, _content, onSuccess, _onError) {
      onSuccess({ goal_succeeded: true, result: '{"value":3}' });
    },
  };

  let client = new ROS.ActionClient('/demo', 'demo_pkg/DemoAction');
  client.send_goal({}, result => {
    successResult = result;
  });
  assert.deepStrictEqual(successResult, { value: 3 });

  logs.length = 0;
  successResult = 'unchanged';
  global.API.postData = function(_action, _content, onSuccess, _onError) {
    onSuccess({ goal_succeeded: false, reason: 'Goal rejected!' });
  };

  client.send_goal({}, result => {
    successResult = result;
  });
  assert.strictEqual(successResult, undefined);
  assertLog(logs, 'error', "Goal for '/demo' - failed!");
  assertLog(logs, 'info', 'Goal rejected!');

  let timeoutCalled = false;
  let timeoutPayload;
  let timeoutOptions;
  global.API.postData = function(_action, content, onSuccess, _onError, options) {
    timeoutPayload = content;
    timeoutOptions = options;
    onSuccess({ goal_succeeded: false, timed_out: true, reason: 'Timed out waiting for action result.' });
  };

  client.send_goal({}, result => {
    successResult = result;
  }, undefined, 20000, () => {
    timeoutCalled = true;
  });
  assert.strictEqual(timeoutCalled, true);
  assert.strictEqual(timeoutPayload.timeout_sec, 20);
  assert.strictEqual(timeoutOptions.timeoutMs, 25000);
}

async function runRenderConfigCase() {
  setupGlobals();
  global.Drawable = {};
  global.UI.Settings = {
    getStatemachineTextSize() { throw new Error('settings should not be read directly'); },
    isStatemachineTextBold() { throw new Error('settings should not be read directly'); },
    isStatemachineTextExtraBold() { throw new Error('settings should not be read directly'); },
    getTransitionLineWidthNormal() { throw new Error('settings should not be read directly'); },
    getTransitionLineWidthBold() { throw new Error('settings should not be read directly'); },
    getTransitionLineWidthExtraBold() { throw new Error('settings should not be read directly'); },
    getGridsize() { throw new Error('settings should not be read directly'); },
  };
  global.UI.Statemachine = {
    getRenderConfig() {
      return {
        gridsize: 25,
        text_scale: 1.5,
        text_weight: 700,
        transition_line_width_normal: 2.0,
        transition_line_width_bold: 5.0,
        transition_line_width_extra_bold: 7.0,
      };
    },
    getPanShift() {
      return { x: 0, y: 0 };
    },
  };
  global.Raphael = {
    snapTo(grid, value) {
      return Math.round(value / grid) * grid;
    },
  };

  loadScript('flexbe_webui/app/drawable/drawable_helper.js');

  assert.strictEqual(Drawable.Helper.getTextScale(), 1.5);
  assert.strictEqual(Drawable.Helper.getTextWeight(), 700);
  assert.strictEqual(Drawable.Helper.getTransitionStrokeWidth(false), 5.0);
  assert.strictEqual(Drawable.Helper.getTransitionStrokeWidth(true), 7.0);

  const snapped = Drawable.Helper.snapToCenter(40, 60, 20, 20);
  assert.strictEqual(typeof snapped.x, 'number');
  assert.strictEqual(typeof snapped.y, 'number');
}

async function runTupleParameterCase() {
  const { acknowledgements } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/ui_dashboard.js');
  loadScript('flexbe_webui/app/_helper/checking.js');
  const tupleParameter = {
    type: 'tuple',
    name: 'target_values',
    default: "('alpha', 2, 3.5)",
    label: 'Targets',
    hint: 'Tuple input',
    additional: undefined,
  };

  global.Behavior = {
    getBehaviorName() { return 'Demo'; },
    getBehaviorDescription() { return 'desc'; },
    getAuthor() { return 'tester'; },
    getPrivateVariables() { return []; },
    getDefaultUserdata() { return []; },
    getBehaviorParameters() {
      return [tupleParameter];
    },
    getInterfaceOutcomes() { return ['finished']; },
    getInterfaceInputKeys() { return []; },
    getInterfaceOutputKeys() { return []; },
    getManualCodeImport() { return []; },
  };

  Checking.variables = new Set();
  assert.strictEqual(Checking.checkDashboard(), undefined);

  tupleParameter.default = '(False, True, False)';

  assert.strictEqual(
    Checking.checkDashboard(),
    undefined,
    'boolean tuple default should be valid'
  );

  tupleParameter.default = "(False, 'alpha', None, 1)";

  assert.strictEqual(
    Checking.checkDashboard(),
    undefined,
    'mixed boolean/string/None/numeric tuple default should be valid'
  );

  tupleParameter.default = '(alpha, 2)';

  assert.strictEqual(
    Checking.checkDashboard(),
    'tuple parameter target_values has illegal default value: (alpha, 2)'
  );

  tupleParameter.default = '(2)';

  assert.strictEqual(
    Checking.checkDashboard(),
    undefined
  );

  tupleParameter.default = "('alpha', 2)";

  global.Behavior.updateBehaviorParameter = function(name, value, key) {
    const entry = this.getBehaviorParameters()[0];
    if (name === entry.name && key === 'default') {
      entry.default = value;
    }
  };

  global.UI.Dashboard.createParameterAdditionalEdit = function(_paramName, tr) {
    let table = document.createElement('table');
    table.appendChild(tr);
    return table;
  };
  global.UI.Dashboard.updateTabTargets = function() {
    return [];
  };
  document.getElementById('db_parameter_edit_table').innerHTML = '';
  UI.Dashboard.createBehaviorParameterEdit('target_values');
  let valueField = document.getElementById('db_field_parameter_edit_table_value_input');
  valueField.value = '("alpha", 2)';
  valueField.dispatchEvent({ type: 'blur', preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(global.Behavior.getBehaviorParameters()[0].default, "('alpha', 2)");
  assert(
    acknowledgements.some(message => message.includes('Double quotes are not allowed.')),
    `Expected tuple quote warning acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );

  acknowledgements.length = 0;
  valueField.value = '(2)';
  valueField.dispatchEvent({ type: 'blur', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(global.Behavior.getBehaviorParameters()[0].default, '(2,)');
  assert.strictEqual(acknowledgements.length, 0);
}

async function runStateParameterDocTypeValidationCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/checking.js');

  const stateDef = {
    getParamDesc() {
      return [
        { name: 'flag', type: 'str|bool' },
        { name: 'label', type: 'String' },
        { name: 'enabled', type: 'Boolean' },
        { name: 'count', type: 'int' },
        { name: 'pose', type: 'PoseStamped' },
      ];
    },
  };
  global.WS.Statelib.getFromLib = function(stateType) {
    return stateType === 'pkg.TypedState' ? stateDef : undefined;
  };

  function makeState(paramName, paramValue) {
    return {
      getStateName() { return 'Typed'; },
      getStatePath() { return '/Typed'; },
      getStateType() { return 'pkg.TypedState'; },
      getParameters() { return [paramName]; },
      getParameterValues() { return [paramValue]; },
      getInputKeys() { return []; },
      getInputMapping() { return []; },
      getOutputKeys() { return []; },
      getOutputMapping() { return []; },
      getContainer() {
        return {
          getDataflow() { return []; },
          isConcurrent() { return false; },
        };
      },
      getOutcomes() { return []; },
      getOutcomesUnconnected() { return []; },
    };
  }

  Checking.variables = new Set(['self', 'self.runtime_flag']);
  assert.strictEqual(Checking.checkSingleState(makeState('flag', 'True')), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('flag', '"ready"')), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('label', "'ready'")), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('enabled', 'False')), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('count', '7')), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('enabled', 'self.runtime_flag')), undefined);
  assert.strictEqual(Checking.checkSingleState(makeState('pose', '"map"')), undefined);

  const warningsBeforeMismatch = logs.filter(entry => entry.level === 'warn').length;
  assert.strictEqual(Checking.checkSingleState(makeState('enabled', '"not a bool"')), undefined);
  const mismatchWarnings = logs
    .filter(entry => entry.level === 'warn')
    .slice(warningsBeforeMismatch);
  assert.strictEqual(mismatchWarnings.length, 1);
  assert(mismatchWarnings[0].message.includes("documented as 'Boolean'"));
  assert(mismatchWarnings[0].message.includes('looks like string'));
}

async function runDashboardParameterEditCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/ui_dashboard.js');

  const parameter = {
    type: 'enum',
    name: 'mode',
    default: 'alpha',
    label: 'Mode',
    hint: 'Operator mode',
    additional: ['alpha'],
  };
  const parameters = [parameter];

  global.Behavior = {
    getBehaviorParameters() {
      return parameters;
    },
    getBehaviorParameterElement(name) {
      return this.getBehaviorParameters().find(entry => entry.name === name);
    },
    updateBehaviorParameter(name, value, key) {
      const entry = this.getBehaviorParameterElement(name);
      assert(entry, `Missing parameter '${name}'`);
      entry[key] = value;
    },
  };

  global.UI.Dashboard.updateTabTargets = function() {
    return [];
  };

  const turnButton = document.getElementById('db_parameter_edit_table_turn_button');
  turnButton.addEventListener = function() {};
  turnButton.removeEventListener = function() {};

  const parameterTable = document.getElementById('db_parameter_table');
  parameterTable.innerHTML = '';
  const parameterRow = document.createElement('tr');
  const parameterTypeCell = document.createElement('td');
  const parameterTypeInput = document.createElement('select');
  parameterTypeInput.name = parameter.name;
  parameterTypeCell.appendChild(parameterTypeInput);
  parameterRow.appendChild(parameterTypeCell);
  parameterTable.appendChild(parameterRow);

  document.getElementById('db_parameter_edit_table').innerHTML = '';
  UI.Dashboard.createBehaviorParameterEdit('mode');

  const typeField = document.getElementById('db_field_parameter_edit_table_type_input');
  const valueField = document.getElementById('db_field_parameter_edit_table_value_input');
  const addInput = document.getElementById('db_field_parameter_edit_table_add_input');
  const addButton = document.getElementById('db_field_parameter_edit_table_add_button');
  const removeSelect = document.getElementById('db_field_parameter_edit_table_remove_input');
  const removeButton = document.getElementById('db_field_parameter_edit_table_remove_button');

  addInput.value = 'beta';
  addButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(parameter.additional, ['alpha', 'beta']);
  assert.strictEqual(parameter.default, 'alpha');

  removeSelect.selectedIndex = 0;
  removeButton.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(parameter.additional, ['beta']);
  assert.strictEqual(parameter.default, 'beta');

  document.getElementById('db_parameter_edit_table').innerHTML = '';
  UI.Dashboard.createBehaviorParameterEdit('mode');
  const numericTypeField = document.getElementById('db_field_parameter_edit_table_type_input');
  const numericValueField = document.getElementById('db_field_parameter_edit_table_value_input');

  numericTypeField.value = 'numeric';
  numericTypeField.options = [
    { value: 'enum' },
    { value: 'numeric' },
    { value: 'boolean' },
    { value: 'text' },
    { value: 'tuple' },
    { value: 'yaml' },
  ];
  numericTypeField.selectedIndex = 1;
  numericTypeField.dispatchEvent({ type: 'change', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(parameter.type, 'numeric');
  assert.strictEqual(parameter.default, '0');
  assert.deepStrictEqual(parameter.additional, { min: 0, max: 1 });
  assert.strictEqual(numericValueField.value, '0');
  assert.strictEqual(numericValueField.type, 'number');

  document.getElementById('input_db_parameter_type_add').selectedIndex = 0;
  document.getElementById('input_db_parameter_name_add').value = '';
  await UI.Dashboard._addBehaviorParameter('enum', 'sync_mode');
  document.getElementById('db_parameter_edit_table').innerHTML = '';
  UI.Dashboard.createBehaviorParameterEdit('sync_mode');
  const syncedRowTypeField = document.getElementById('db_field_parameter_table_type_input_sync_mode');
  syncedRowTypeField.options = [
    { value: 'enum' },
    { value: 'numeric' },
    { value: 'boolean' },
    { value: 'text' },
    { value: 'tuple' },
    { value: 'yaml' },
  ];
  syncedRowTypeField.selectedIndex = 5;
  syncedRowTypeField.dispatchEvent({ type: 'blur', preventDefault() {}, stopPropagation() {} });
  const syncedEntry = parameters.find(entry => entry.name === 'sync_mode');
  assert.strictEqual(syncedEntry.type, 'yaml');
  assert.strictEqual(document.getElementById('db_field_parameter_edit_table_value_input').type, 'text');
  assert.notStrictEqual(document.getElementById('db_field_parameter_edit_table_key_input'), undefined);

  const refreshedTypeField = document.getElementById('db_field_parameter_edit_table_type_input');
  refreshedTypeField.value = 'text';
  refreshedTypeField.selectedIndex = 3;
  refreshedTypeField.dispatchEvent({ type: 'change', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(syncedEntry.type, 'text');
  assert.strictEqual(document.getElementById('db_field_parameter_edit_table_value_input').type, 'text');
}

async function runBehaviorInterfaceKeyRenameCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  global.WS = {
    StateMachineDefinition: function() {},
  };
  global.Statemachine = function() {
    let inputKeys = [];
    let outputKeys = [];
    this.setInputKeys = function(keys) {
      inputKeys = keys;
    };
    this.getInputKeys = function() {
      return inputKeys;
    };
    this.setOutputKeys = function(keys) {
      outputKeys = keys;
    };
    this.getOutputKeys = function() {
      return outputKeys;
    };
    this.addOutcome = function() {};
    this.removeOutcome = function() {};
    this.updateOutcome = function() {};
  };

  loadScript('flexbe_webui/app/_model/behavior.js');

  Behavior.resetBehavior();

  Behavior.addInterfaceInputKey('goal');
  Behavior.updateInterfaceInputKeys('goal', 'goal_pose');
  assert.deepStrictEqual(Behavior.getInterfaceInputKeys(), ['goal_pose']);
  assert.deepStrictEqual(Behavior.getStatemachine().getInputKeys(), ['goal_pose']);

  Behavior.removeInterfaceInputKey('goal_pose');
  assert.deepStrictEqual(Behavior.getInterfaceInputKeys(), []);
  assert.deepStrictEqual(Behavior.getStatemachine().getInputKeys(), []);

  Behavior.addInterfaceInputKey('goal_pose');
  assert.deepStrictEqual(Behavior.getInterfaceInputKeys(), ['goal_pose']);
  assert.deepStrictEqual(Behavior.getStatemachine().getInputKeys(), ['goal_pose']);

  Behavior.addInterfaceOutputKey('result');
  Behavior.updateInterfaceOutputKeys('result', 'final_result');
  assert.deepStrictEqual(Behavior.getInterfaceOutputKeys(), ['final_result']);
  assert.deepStrictEqual(Behavior.getStatemachine().getOutputKeys(), ['final_result']);

  Behavior.removeInterfaceOutputKey('final_result');
  assert.deepStrictEqual(Behavior.getInterfaceOutputKeys(), []);
  assert.deepStrictEqual(Behavior.getStatemachine().getOutputKeys(), []);
}

async function runBehaviorInterfaceOutcomeRenameCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  function makeStateDefinition(stateClass, outcomes = [], autonomy = []) {
    return {
      getStateClass() { return stateClass; },
      getStatePath() { return `demo_pkg/${stateClass.toLowerCase()}`; },
      getStatePackage() { return 'demo_pkg'; },
      getParameters() { return []; },
      getDefaultParameterValues() { return []; },
      getOutcomes() { return outcomes.slice(); },
      getDefaultAutonomy() { return autonomy.slice(); },
      getInputKeys() { return []; },
      getOutputKeys() { return []; },
    };
  }

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    let smOutcomes = outcomes.slice();
    this.getStateClass = function() { return ':STATEMACHINE'; };
    this.getStatePath = function() { return 'demo_pkg/statemachine'; };
    this.getStatePackage = function() { return 'demo_pkg'; };
    this.getParameters = function() { return []; };
    this.getDefaultParameterValues = function() { return []; };
    this.getOutcomes = function() { return smOutcomes; };
    this.getDefaultAutonomy = function() { return smOutcomes.map(function() { return -1; }); };
    this.getInputKeys = function() { return inputKeys.slice(); };
    this.getOutputKeys = function() { return outputKeys.slice(); };
    this.addOutcome = function(outcome) { smOutcomes.push(outcome); };
    this.insertOutcome = function(outcome, index) { smOutcomes.splice(index, 0, outcome); };
    this.removeOutcome = function(outcome) { smOutcomes.remove(outcome); };
  };

  UI.Statemachine.getPanShift = function() {
    return { x: 0, y: 0 };
  };
  UI.Statemachine.getR = function() {
    return { width: 400, height: 300 };
  };
  UI.Statemachine.getGridSize = function() {
    return 50;
  };

  WS.Statelib.getFromLib = function(stateClass) {
    if (stateClass === ':INIT') {
      return makeStateDefinition(':INIT');
    }
    if (stateClass === ':OUTCOME') {
      return makeStateDefinition(':OUTCOME');
    }
    if (stateClass === ':CONDITION') {
      return makeStateDefinition(':CONDITION');
    }
    return makeStateDefinition(stateClass);
  };
  global.BehaviorState = function() {};

  loadScript('flexbe_webui/app/_model/transition.js');
  loadScript('flexbe_webui/app/_model/state.js');
  loadScript('flexbe_webui/app/_model/statemachine.js');
  loadScript('flexbe_webui/app/_model/behavior.js');

  Behavior.resetBehavior();

  Behavior.addInterfaceOutcome('finished');
  Behavior.addInterfaceOutcome('failed');
  Behavior.addInterfaceOutcome('aborted');
  Behavior.updateInterfaceOutcome('finished', 'complete');

  assert.deepStrictEqual(Behavior.getInterfaceOutcomes(), ['complete', 'failed', 'aborted']);
  assert.deepStrictEqual(Behavior.getStatemachine().getOutcomes(), ['complete', 'failed', 'aborted']);
  assert.strictEqual(Behavior.getStatemachine().getSMOutcomes()[0].getStateName(), 'complete');

  Behavior.getStatemachine().setConcurrent(true);

  assert.deepStrictEqual(Behavior.getStatemachine().getOutcomes(), ['complete', 'failed', 'aborted']);
  assert.deepStrictEqual(
    Behavior.getStatemachine().getSMOutcomes().map(function(state) { return state.getStateName(); }),
    ['complete#0', 'failed#1', 'aborted#2']
  );

  Behavior.getStatemachine().setConcurrent(false);

  assert.deepStrictEqual(Behavior.getStatemachine().getOutcomes(), ['complete', 'failed', 'aborted']);
  assert.deepStrictEqual(
    Behavior.getStatemachine().getSMOutcomes().map(function(state) { return state.getStateName(); }),
    ['complete', 'failed', 'aborted']
  );
}

async function runDashboardOutcomeUndoCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  function makeStateDefinition(stateClass, outcomes = [], autonomy = []) {
    return {
      getStateClass() { return stateClass; },
      getStatePath() { return `demo_pkg/${stateClass.toLowerCase()}`; },
      getStatePackage() { return 'demo_pkg'; },
      getParameters() { return []; },
      getDefaultParameterValues() { return []; },
      getOutcomes() { return outcomes.slice(); },
      getDefaultAutonomy() { return autonomy.slice(); },
      getInputKeys() { return []; },
      getOutputKeys() { return []; },
    };
  }

  UI.Statemachine.getPanShift = function() {
    return { x: 0, y: 0 };
  };
  UI.Statemachine.getR = function() {
    return { width: 400, height: 300 };
  };
  UI.Statemachine.getGridSize = function() {
    return 50;
  };
  UI.Statemachine.refreshView = function() {};
  UI.Menu.isPageStatemachine = function() { return false; };

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    let smOutcomes = outcomes.slice();
    this.getStateClass = function() { return ':STATEMACHINE'; };
    this.getStatePath = function() { return 'demo_pkg/statemachine'; };
    this.getStatePackage = function() { return 'demo_pkg'; };
    this.getParameters = function() { return []; };
    this.getDefaultParameterValues = function() { return []; };
    this.getOutcomes = function() { return smOutcomes; };
    this.getDefaultAutonomy = function() { return smOutcomes.map(function() { return -1; }); };
    this.getInputKeys = function() { return inputKeys.slice(); };
    this.getOutputKeys = function() { return outputKeys.slice(); };
    this.addOutcome = function(outcome) { smOutcomes.push(outcome); };
    this.insertOutcome = function(outcome, index) { smOutcomes.splice(index, 0, outcome); };
    this.removeOutcome = function(outcome) { smOutcomes.remove(outcome); };
  };

  WS.Statelib.getFromLib = function(stateClass) {
    if (stateClass === ':INIT') {
      return makeStateDefinition(':INIT');
    }
    if (stateClass === ':OUTCOME') {
      return makeStateDefinition(':OUTCOME');
    }
    if (stateClass === ':CONDITION') {
      return makeStateDefinition(':CONDITION');
    }
    if (stateClass === 'WorkerState') {
      return makeStateDefinition('WorkerState', ['done'], [0]);
    }
    return makeStateDefinition(stateClass);
  };
  global.BehaviorState = function() {};

  loadScript('flexbe_webui/app/_model/transition.js');
  loadScript('flexbe_webui/app/_model/state.js');
  loadScript('flexbe_webui/app/_model/statemachine.js');
  loadScript('flexbe_webui/app/_model/behavior.js');
  loadScript('flexbe_webui/app/ui/ui_dashboard.js');

  UI.Dashboard.updateTabTargets = function() {
    return [];
  };

  const activities = [];
  ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE = 'behavior_interface_change';
  ActivityTracer.addActivity = function(type, description, undo, redo) {
    activities.push({ type, description, undo, redo });
  };

  document.getElementById('db_outcome_table').innerHTML = '';
  document.getElementById('input_db_outcome_add').value = '';

  Behavior.resetBehavior();

  Behavior.addInterfaceOutcome('done');
  Behavior.addInterfaceOutcome('failed');
  UI.Dashboard._addBehaviorOutcome('done', 0, true, true);
  UI.Dashboard._addBehaviorOutcome('failed', 1, true, true);

  const root = Behavior.getStatemachine();
  const alpha = new State('Alpha', WS.Statelib.getFromLib('WorkerState'));
  const beta = new State('Beta', WS.Statelib.getFromLib('WorkerState'));
  root.addState(alpha);
  root.addState(beta);

  const baseOutcome = root.getSMOutcomeByName('done');
  baseOutcome.setPosition({ x: 320, y: 80 });
  root.addTransition(new Transition(alpha, baseOutcome, 'done', 0));
  root.tryDuplicateOutcome('done');

  const copiedOutcome = root.getSMOutcomeByName('done#1');
  copiedOutcome.setPosition({ x: 320, y: 180 });
  root.addTransition(new Transition(beta, copiedOutcome, 'done', 0));
  root.tryDuplicateOutcome('done');

  const spareOutcome = root.getSMOutcomeByName('done#2');
  spareOutcome.setPosition({ x: 320, y: 280 });
  assert(spareOutcome);

  const removedSnapshot = UI.Dashboard.removeBehaviorOutcome('done');
  assert(removedSnapshot);
  assert.strictEqual(activities.length, 1);
  assert.deepStrictEqual(Behavior.getInterfaceOutcomes(), ['failed']);
  assert.deepStrictEqual(root.getOutcomes(), ['failed']);
  assert.strictEqual(root.getSMOutcomeByName('done'), undefined);
  assert.strictEqual(root.getSMOutcomeByName('done#1'), undefined);
  assert.strictEqual(document.getElementById('db_outcome_table').children.length, 1);
  assert.strictEqual(document.getElementById('db_outcome_table').children[0].id, 'db_field_outcome_table_row_failed');

  activities[0].undo();

  const restoredAlpha = root.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Alpha' && transition.getOutcome() === 'done';
  });
  const restoredBeta = root.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  assert(restoredAlpha);
  assert.strictEqual(restoredAlpha.getTo().getStateName(), 'done');
  assert(restoredBeta);
  assert.strictEqual(restoredBeta.getTo().getStateName(), 'done#1');
  assert.deepStrictEqual(Behavior.getInterfaceOutcomes(), ['done', 'failed']);
  assert.deepStrictEqual(root.getOutcomes(), ['done', 'failed']);
  assert.strictEqual(root.getSMOutcomeByName('done#1').getPosition().y, 180);
  assert.strictEqual(root.getSMOutcomeByName('done#2').getPosition().y, 280);
  assert.strictEqual(document.getElementById('db_outcome_table').children.length, 2);
  assert.strictEqual(document.getElementById('db_outcome_table').children[0].id, 'db_field_outcome_table_row_done');
  assert.strictEqual(document.getElementById('db_outcome_table').children[1].id, 'db_field_outcome_table_row_failed');

  activities[0].redo();

  assert.deepStrictEqual(Behavior.getInterfaceOutcomes(), ['failed']);
  assert.deepStrictEqual(root.getOutcomes(), ['failed']);
  assert.strictEqual(root.getSMOutcomeByName('done#1'), undefined);
  assert.strictEqual(document.getElementById('db_outcome_table').children.length, 1);
  assert.strictEqual(document.getElementById('db_outcome_table').children[0].id, 'db_field_outcome_table_row_failed');
}

async function runDashboardOutcomeCollisionCase() {
  const { acknowledgements, logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const interfaceOutcomes = [];
  global.Behavior = {
    getInterfaceOutcomes() {
      return interfaceOutcomes;
    },
    addInterfaceOutcome(outcome) {
      interfaceOutcomes.push(outcome);
    },
    removeInterfaceOutcome(outcome) {
      interfaceOutcomes.remove(outcome);
      return { outcome };
    },
    restoreInterfaceOutcome(removed) {
      interfaceOutcomes.push(removed.outcome);
    },
    updateInterfaceOutcome(oldValue, newValue) {
      const index = interfaceOutcomes.indexOf(oldValue);
      if (index !== -1) {
        interfaceOutcomes[index] = newValue;
      }
    },
  };

  UI.Menu.isPageStatemachine = function() { return false; };
  ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE = 'behavior_interface_change';
  ActivityTracer.ACT_INTERNAL_CONFIG_CHANGE = 'internal_config_change';
  ActivityTracer.addActivity = function() {};

  loadScript('flexbe_webui/app/ui/ui_dashboard.js');

  UI.Dashboard.updateTabTargets = function() {
    return [];
  };

  document.getElementById('db_outcome_table').innerHTML = '';
  document.getElementById('input_db_outcome_add').value = '';
  document.setStrictElementLookup(true);

  UI.Dashboard._addBehaviorOutcome('alpha_beta', 0, true, false);
  assert.deepStrictEqual(interfaceOutcomes, ['alpha_beta']);

  let addResult = await UI.Dashboard.addBehaviorOutcome('alpha beta');
  assert.strictEqual(addResult, false);
  assert.deepStrictEqual(interfaceOutcomes, ['alpha_beta']);

  UI.Dashboard._addBehaviorOutcome('gamma', 1, true, false);
  let renameResult = await UI.Dashboard.changeBehaviorOutcome('alpha beta', 'gamma');
  assert.strictEqual(renameResult, false);
  assert.deepStrictEqual(interfaceOutcomes, ['alpha_beta', 'gamma']);

  assert(
    acknowledgements.some(message => message.includes("Outcome name 'alpha beta' conflicts with the Dashboard row id used by 'alpha_beta'.")),
    `Expected collision acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
  assert(
    logs.some(entry => entry.level === 'warn' && entry.message.includes("Dashboard outcome id collision between 'alpha beta' and 'alpha_beta'")),
    `Expected collision warning log, got ${JSON.stringify(logs)}`
  );

  acknowledgements.length = 0;
  logs.length = 0;

  UI.Dashboard._addBehaviorOutcome('multi word source', 2, true, false);
  let multiRenameResult = await UI.Dashboard.changeBehaviorOutcome('multi word target', 'multi word source');
  assert.strictEqual(multiRenameResult, true);
  assert.strictEqual(document.getElementById('db_field_outcome_table_input_field_multi_word_source'), undefined);
  assert.strictEqual(document.getElementById('db_field_outcome_table_row_multi_word_source'), undefined);
  assert.notStrictEqual(document.getElementById('db_field_outcome_table_input_field_multi_word_target'), undefined);
  assert.notStrictEqual(document.getElementById('db_field_outcome_table_row_multi_word_target'), undefined);
  assert.deepStrictEqual(interfaceOutcomes, ['alpha_beta', 'gamma', 'multi word target']);
}

async function runDashboardInterfaceKeyFlowsCase() {
  const { acknowledgements, logs, elements } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const interfaceInputKeys = [];
  const interfaceOutputKeys = [];
  global.Behavior = {
    getInterfaceInputKeys() {
      return interfaceInputKeys;
    },
    addInterfaceInputKey(key) {
      interfaceInputKeys.push(key);
    },
    removeInterfaceInputKey(key) {
      interfaceInputKeys.remove(key);
    },
    updateInterfaceInputKeys(oldValue, newValue) {
      const index = interfaceInputKeys.indexOf(oldValue);
      if (index !== -1) {
        interfaceInputKeys[index] = newValue;
      }
    },
    getInterfaceOutputKeys() {
      return interfaceOutputKeys;
    },
    addInterfaceOutputKey(key) {
      interfaceOutputKeys.push(key);
    },
    removeInterfaceOutputKey(key) {
      interfaceOutputKeys.remove(key);
    },
    updateInterfaceOutputKeys(oldValue, newValue) {
      const index = interfaceOutputKeys.indexOf(oldValue);
      if (index !== -1) {
        interfaceOutputKeys[index] = newValue;
      }
    },
  };

  UI.Menu.isPageStatemachine = function() { return false; };
  UI.Statemachine.refreshView = function() {};

  const activities = [];
  ActivityTracer.ACT_BEHAVIOR_INTERFACE_CHANGE = 'behavior_interface_change';
  ActivityTracer.addActivity = function(type, description, undo, redo) {
    activities.push({ type, description, undo, redo });
  };

  loadScript('flexbe_webui/app/ui/ui_dashboard.js');

  UI.Dashboard.updateTabTargets = function() {
    return [];
  };

  document.getElementById('db_input_key_table');
  document.getElementById('db_output_key_table');
  document.getElementById('input_db_input_key_add');
  document.getElementById('input_db_output_key_add');
  document.setStrictElementLookup(true);

  let outputAddFocusCount = 0;
  document.getElementById('input_db_output_key_add').focus = function() {
    outputAddFocusCount += 1;
  };

  UI.Dashboard._addInterfaceInputKey('rename_source');
  activities.length = 0;

  let inputRenameSuccess = await UI.Dashboard.changeInterfaceInputKey('rename_target', 'rename_source');
  assert.strictEqual(inputRenameSuccess, true);
  assert.strictEqual(document.getElementById('db_field_input_key_table_input_field_rename_source'), undefined);
  assert.strictEqual(document.getElementById('db_field_input_key_table_row_rename_source'), undefined);
  assert.strictEqual(document.getElementById('db_field_input_key_table_remove_button_rename_source'), undefined);
  assert.notStrictEqual(document.getElementById('db_field_input_key_table_input_field_rename_target'), undefined);

  UI.Dashboard._addInterfaceInputKey('multi word source');
  activities.length = 0;

  let multiInputRenameResult = await UI.Dashboard.changeInterfaceInputKey('multi word target', 'multi word source');
  assert.strictEqual(multiInputRenameResult, true);
  assert.strictEqual(document.getElementById('db_field_input_key_table_input_field_multi_word_source'), undefined);
  assert.strictEqual(document.getElementById('db_field_input_key_table_row_multi_word_source'), undefined);
  assert.notStrictEqual(document.getElementById('db_field_input_key_table_input_field_multi_word_target'), undefined);
  assert.deepStrictEqual(interfaceInputKeys, ['rename_target', 'multi word target']);

  UI.Dashboard.removeInterfaceInputKey('rename_target', true);
  UI.Dashboard.removeInterfaceInputKey('multi word target', true);
  activities.length = 0;

  UI.Dashboard._addInterfaceInputKey('goal_pose');
  activities.length = 0;
  acknowledgements.length = 0;
  logs.length = 0;

  let inputAddResult = await UI.Dashboard.addInterfaceInputKey('goal pose');
  assert.strictEqual(inputAddResult, false);
  assert.deepStrictEqual(interfaceInputKeys, ['goal_pose']);

  UI.Dashboard._addInterfaceInputKey('other');
  activities.length = 0;

  let inputRenameResult = await UI.Dashboard.changeInterfaceInputKey('goal pose', 'other');
  assert.strictEqual(inputRenameResult, false);
  assert.deepStrictEqual(interfaceInputKeys, ['goal_pose', 'other']);

  assert(
    acknowledgements.some(message => message.includes("Input key 'goal pose' conflicts with the Dashboard row id used by 'goal_pose'.")),
    `Expected input-key collision acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
  assert(
    logs.some(entry => entry.level === 'warn' && entry.message.includes("Dashboard input key id collision between 'goal pose' and 'goal_pose'")),
    `Expected input-key collision warning log, got ${JSON.stringify(logs)}`
  );

  acknowledgements.length = 0;
  logs.length = 0;
  activities.length = 0;

  let outputAddResult = await UI.Dashboard.addInterfaceOutputKey('result');
  assert.strictEqual(outputAddResult, true);
  assert.deepStrictEqual(interfaceOutputKeys, ['result']);
  assert.strictEqual(activities.length, 1);

  activities[0].undo();
  assert.deepStrictEqual(interfaceOutputKeys, []);
  assert.strictEqual(document.getElementById('db_output_key_table').children.length, 0);

  activities[0].redo();
  assert.deepStrictEqual(interfaceOutputKeys, ['result']);
  assert.strictEqual(document.getElementById('db_output_key_table').children.length, 1);

  activities.length = 0;
  outputAddFocusCount = 0;
  assert.strictEqual(document.getElementById('input_db_output_key_table'), undefined);
  assert.strictEqual(elements.has('input_db_output_key_table'), false);

  let removeResult = UI.Dashboard.removeInterfaceOutputKey('result');
  assert.strictEqual(removeResult, true);
  assert.deepStrictEqual(interfaceOutputKeys, []);
  assert.strictEqual(outputAddFocusCount, 1);
  assert.strictEqual(document.getElementById('input_db_output_key_table'), undefined);
  assert.strictEqual(elements.has('input_db_output_key_table'), false);

  acknowledgements.length = 0;
  logs.length = 0;
  activities.length = 0;

  UI.Dashboard._addInterfaceOutputKey('final_result');
  activities.length = 0;

  let outputCollisionAddResult = await UI.Dashboard.addInterfaceOutputKey('final result');
  assert.strictEqual(outputCollisionAddResult, false);
  assert.deepStrictEqual(interfaceOutputKeys, ['final_result']);

  UI.Dashboard._addInterfaceOutputKey('other_output');
  activities.length = 0;

  let outputRenameResult = await UI.Dashboard.changeInterfaceOutputKey('final result', 'other_output');
  assert.strictEqual(outputRenameResult, false);
  assert.deepStrictEqual(interfaceOutputKeys, ['final_result', 'other_output']);

  assert(
    acknowledgements.some(message => message.includes("Output key 'final result' conflicts with the Dashboard row id used by 'final_result'.")),
    `Expected output-key collision acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
  assert(
    logs.some(entry => entry.level === 'warn' && entry.message.includes("Dashboard output key id collision between 'final result' and 'final_result'")),
    `Expected output-key collision warning log, got ${JSON.stringify(logs)}`
  );

  acknowledgements.length = 0;
  logs.length = 0;

  UI.Dashboard._addInterfaceOutputKey('multi word source');
  activities.length = 0;

  let multiOutputRenameResult = await UI.Dashboard.changeInterfaceOutputKey('multi word target', 'multi word source');
  assert.strictEqual(multiOutputRenameResult, true);
  assert.strictEqual(document.getElementById('db_field_output_key_table_input_field_multi_word_source'), undefined);
  assert.strictEqual(document.getElementById('db_field_output_key_table_row_multi_word_source'), undefined);
  assert.notStrictEqual(document.getElementById('db_field_output_key_table_input_field_multi_word_target'), undefined);
  assert.deepStrictEqual(interfaceOutputKeys, ['final_result', 'other_output', 'multi word target']);
}

async function runModelGeneratorInterfaceValidationCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const addedValues = [];
  UI.Dashboard.setBehaviorName = function() {};
  UI.Dashboard.setBehaviorPackage = function() {};
  UI.Dashboard.setBehaviorDescription = function() {};
  UI.Dashboard.setBehaviorTags = function() {};
  UI.Dashboard.setBehaviorAuthor = function() {};
  UI.Dashboard.setBehaviorDate = function() {};
  UI.Dashboard._addPrivateVariable = function() {};
  UI.Dashboard.addDefaultUserdata = function() {};
  UI.Dashboard.addPrivateFunction = function() {};
  UI.Dashboard.addManualImport = function() {};
  UI.Dashboard.addParameter = function() {};
  UI.Dashboard._addBehaviorOutcome = function(outcome, insertIdx, skipHistory) {
    addedValues.push({ type: 'outcome', value: outcome, skipHistory });
  };
  UI.Dashboard._addInterfaceInputKey = function(key, skipHistory) {
    addedValues.push({ type: 'input', value: key, skipHistory });
  };
  UI.Dashboard._addInterfaceOutputKey = function(key, skipHistory) {
    addedValues.push({ type: 'output', value: key, skipHistory });
  };

  Behavior.setManualCodeInit = function() {};
  Behavior.setManualCodeCreate = function() {};
  Behavior.setManualCodeFunc = function() {};
  Behavior.setFiles = function() {};
  Behavior.updateBehaviorParameter = function() {};

  global.Note = function() {
    this.setPosition = function() {};
    this.setContainerPath = function() {};
    this.setImportant = function() {};
  };

  loadScript('flexbe_webui/app/io/io_modelgenerator.js');

  const manifest = {
    name: 'DemoBehavior',
    rosnode_name: 'demo_pkg',
    description: '',
    tags: '',
    author: 'Tester',
    date: '2026-03-31',
    params: [],
    codefile_relpath: 'demo_behavior.py',
    codefile_name: 'demo_behavior.py',
    manifest_path: '/tmp/demo_behavior.xml',
  };
  const baseData = {
    creation_date: '2026-03-31',
    manual_code: {
      manual_init: '',
      manual_create: '',
      manual_func: '',
      manual_import: '',
    },
    behavior_comments: [],
    private_variables: [],
    default_userdata: [],
    private_functions: [],
    smi_outcomes: ['done'],
    smi_input: ['goal'],
    smi_output: ['result'],
  };

  assert.throws(function() {
    IO.ModelGenerator.generateBehaviorAttributes(Object.assign({}, baseData, {
      smi_input: ['goal_pose', 'goal pose'],
    }), manifest);
  }, /conflicts with the Dashboard row id used by 'goal_pose'/);
  assert.deepStrictEqual(addedValues, []);

  assert.throws(function() {
    IO.ModelGenerator.generateBehaviorAttributes(Object.assign({}, baseData, {
      smi_outcomes: ['goal pose_final', 'goal_pose final'],
    }), manifest);
  }, /conflicts with the Dashboard row id used by 'goal pose_final'/);
  assert.deepStrictEqual(addedValues, []);

  IO.ModelGenerator.generateBehaviorAttributes(baseData, manifest);
  assert.deepStrictEqual(addedValues, [
    { type: 'outcome', value: 'done', skipHistory: true },
    { type: 'input', value: 'goal', skipHistory: true },
    { type: 'output', value: 'result', skipHistory: true },
  ]);

  addedValues.length = 0;
  const manifestWithoutParams = Object.assign({}, manifest);
  delete manifestWithoutParams.params;
  assert.doesNotThrow(function() {
    IO.ModelGenerator.generateBehaviorAttributes(baseData, manifestWithoutParams);
  });
  assert.deepStrictEqual(addedValues, [
    { type: 'outcome', value: 'done', skipHistory: true },
    { type: 'input', value: 'goal', skipHistory: true },
    { type: 'output', value: 'result', skipHistory: true },
  ]);
}

async function runBehaviorStructureOutcomeCopyCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  global.WS = {
    StateMachineDefinition: function(outcomes = []) {
      this.getOutcomes = function() {
        return outcomes.slice();
      };
    },
  };

  global.State = function(stateName, stateClass = 'State', outcomes = []) {
    let container;
    let pathOverride;
    const autonomy = outcomes.map(function() { return 0; });
    let stateId = -1;

    this.getStateName = function() { return stateName; };
    this.getStateClass = function() { return stateClass; };
    this.getOutcomes = function() { return outcomes; };
    this.getAutonomy = function() { return autonomy; };
    this.getContainer = function() { return container; };
    this.setContainer = function(value) { container = value; };
    this.getStateId = function() { return stateId; };
    this.setStateId = function(value) { stateId = value; };
    this.setStatePath = function(value) { pathOverride = value; };
    this.getStatePath = function() {
      if (pathOverride !== undefined) {
        return pathOverride;
      }
      if (!container) {
        return stateName === '' ? '' : `/${stateName}`;
      }
      const parentPath = container.getStatePath();
      return parentPath === '' ? `/${stateName}` : `${parentPath}/${stateName}`;
    };
  };

  global.Statemachine = function(stateName, definition) {
    State.call(this, stateName, ':STATEMACHINE', definition && definition.getOutcomes ? definition.getOutcomes() : []);
    let states = [];
    let transitions = [];
    let concurrent = false;
    let priority = false;

    this.addState = function(state) {
      states.push(state);
      state.setContainer(this);
    };
    this.getStates = function() { return states; };
    this.getTransitions = function() { return transitions; };
    this.addTransition = function(transition) { transitions.push(transition); };
    this.isConcurrent = function() { return concurrent; };
    this.setConcurrent = function(value) { concurrent = value; };
    this.isPriority = function() { return priority; };
    this.setPriority = function(value) { priority = value; };
    this.getStateByPath = function(path) {
      if (path === '' || path === '/') {
        return this;
      }
      return states.find(function(state) { return state.getStatePath() === path; });
    };
  };
  global.Statemachine.prototype = Object.create(global.State.prototype);
  global.Statemachine.prototype.constructor = global.Statemachine;

  global.BehaviorState = function() {};
  global.Transition = function(from, to, outcome) {
    this.getFrom = function() { return from; };
    this.getTo = function() { return to; };
    this.getOutcome = function() { return outcome; };
  };

  loadScript('flexbe_webui/app/_model/behavior.js');
  Behavior.resetBehavior();

  const rootSm = new Statemachine('', new WS.StateMachineDefinition(['finished']));
  rootSm.setStatePath('');
  rootSm.setStateId(0);

  const alpha = new State('Alpha State', 'SomeState', ['done']);
  alpha.setStateId(1);
  const copiedOutcome = new State('finished#1', ':OUTCOME');
  copiedOutcome.setStateId(2);
  copiedOutcome.setContainer(rootSm);

  rootSm.addState(alpha);
  rootSm.addTransition(new Transition(alpha, copiedOutcome, 'done'));

  Behavior.setStatemachine(rootSm);

  const structure = Behavior.createStructureInfo();
  const alphaInfo = structure.find(function(entry) {
    return entry.path === '/Alpha State';
  });

  assert(alphaInfo);
  assert.deepStrictEqual(alphaInfo.outcomes, ['done']);
  assert.deepStrictEqual(alphaInfo.transitions, ['finished']);
}

async function runRuntimeFlowsCase() {
  const { logs, consoleMessages, restoreConsole } = setupGlobals();
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = function(callback, _delay) {
    callback();
    return 1;
  };

  try {
    loadScript('flexbe_webui/app/prototype.js');
    loadScript('flexbe_webui/app/ui/ui_runtimecontrol.js');

    const updates = [];
    const locks = [];
    const statePathUpdates = [];
    const outcomeStateA = {
      getStatePath() { return '/root/a'; },
      getStateId() { return 1; },
      getOutcomes() { return ['done']; },
      getStateName() { return 'A'; },
    };
    const outcomeStateB = {
      getStatePath() { return '/root/b'; },
      getStateId() { return 2; },
      getOutcomes() { return ['done']; },
      getStateName() { return 'B'; },
    };
    const stateMap = new Map([
      [1, { path: '/root/a', state: outcomeStateA }],
      [2, { path: '/root/b', state: outcomeStateB }],
    ]);

    global.Behavior.getStateMap = function() {
      return stateMap;
    };
    global.RC.Controller = {
      isRunning() { return true; },
      isActive() { return false; },
      needSwitch() { return true; },
      setLockedStatePath() {},
      setCurrentStatePath(pathValue) {
        statePathUpdates.push(pathValue);
      },
    };
    global.RC.PubSub = {
      sendBehaviorUpdate(keys, values, autonomy) {
        updates.push({ keys, values, autonomy });
      },
      sendBehaviorLock(pathValue) {
        locks.push(pathValue);
      },
    };

    UI.RuntimeControl.parseParameterConfig = function(callbackResult) {
      callbackResult([
        { name: 'alpha', value: '7' },
        { name: 'beta', value: 'word' },
      ]);
    };

    const autonomySelect = document.getElementById('selection_rc_autonomy');
    autonomySelect.options = [{ value: '2' }];
    autonomySelect.selectedIndex = 0;

    UI.RuntimeControl.behaviorLockClicked();
    assert.deepStrictEqual(updates, [{
      keys: ['/alpha', '/beta'],
      values: ['7', 'word'],
      autonomy: 2,
    }]);

    updates.length = 0;
    autonomySelect.options = [];
    autonomySelect.selectedIndex = -1;
    UI.RuntimeControl.behaviorLockClicked();
    assert.strictEqual(updates.length, 0);
    assertLog(logs, 'warn', 'No valid autonomy level is available.');

    global.RC.Controller.isActive = function() { return true; };
    global.RC.Controller.needSwitch = function() { return false; };

    const lockSelect = document.getElementById('selection_rc_lock_layer');
    lockSelect.options = [];
    lockSelect.selectedIndex = -1;
    UI.RuntimeControl.behaviorLockClicked();
    assert.strictEqual(locks.length, 0);
    assertLog(logs, 'warn', 'No valid lock layer is available.');

    UI.RuntimeControl.displayOutcomeRequest(0, outcomeStateA);
    stateMap.delete(1);
    UI.RuntimeControl.displayOutcomeRequest(0, outcomeStateB);
    UI.RuntimeControl.displayOutcomeRequest(0, outcomeStateB);

    const invalidLogs = consoleMessages.filter(message => message.includes("displayOutcomeRequest: Invalid key '1'"));
    assert.strictEqual(invalidLogs.length, 1);
    assert(statePathUpdates.includes('/root/a'));
  } finally {
    restoreConsole();
    global.setTimeout = originalSetTimeout;
  }
}

function setupRuntimeDisplayFixture(paths) {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/ui_runtimecontrol.js');

  const emptyContainer = {
    getTransitions() { return []; },
  };
  function makeRuntimeState(pathValue, index) {
    const name = pathValue.split('/').pop();
    return {
      getStatePath() { return pathValue; },
      getStateId() { return (index + 1) << 8; },
      getStateName() { return name; },
      getContainer() { return emptyContainer; },
      getStateClass() { return 'Simple'; },
      getStateType() { return 'Simple'; },
      getOutcomes() { return ['done']; },
      isInsideDifferentBehavior() { return false; },
    };
  }

  const stateMap = new Map(paths.map((pathValue, index) => [pathValue, makeRuntimeState(pathValue, index)]));
  const idMap = new Map(Array.from(stateMap.values()).map(state => [
    state.getStateId(),
    { path: state.getStatePath(), state },
  ]));
  const statusNodes = [];
  function makePaperNode(extra = {}) {
    return Object.assign({
      removed: false,
      attr() { return this; },
      toBack() { return this; },
      remove() { this.removed = true; },
    }, extra);
  }

  global.Raphael = function() {
    return {
      width: 800,
      height: 600,
      rect() { return makePaperNode(); },
      text(x, y, text) {
        const node = makePaperNode({ x, y, text });
        statusNodes.push(node);
        return node;
      },
      remove() {},
    };
  };

  const rootSm = {
    getStateByPath(pathValue) {
      return stateMap.get(pathValue);
    },
  };
  const documentedPaths = [];

  global.ActivityTracer.setUpdateCallback = function() {};
  global.Behavior.getStatemachine = function() {
    return rootSm;
  };
  global.Behavior.getStateMap = function() {
    return idMap;
  };
  global.RC.Controller = {
    isLocked() { return false; },
    setCurrentStatePath(pathValue) {
      UI.RuntimeControl.displayState(pathValue);
    },
    getCurrentState() {
      return stateMap.get(documentedPaths[documentedPaths.length - 1]);
    },
  };
  global.UI.Menu.isPageStatemachine = function() { return false; };
  global.UI.Statemachine = {
    refreshView() {},
  };
  UI.RuntimeControl.displayLockBehavior = function() {};
  UI.RuntimeControl.updateDrawing = function() {};
  UI.RuntimeControl.setDocumentation = function(state) {
    documentedPaths.push(state ? state.getStatePath() : undefined);
  };

  return { documentedPaths, idMap, stateMap, statusNodes };
}

async function runRuntimeDeepestStateCase() {
  const { documentedPaths } = setupRuntimeDisplayFixture([
    '/Container',
    '/Container/Leaf',
  ]);

  UI.RuntimeControl.displayState('/Container');
  UI.RuntimeControl.displayState('/Container/Leaf');

  assert.strictEqual(documentedPaths[documentedPaths.length - 2], '/Container');
  assert.strictEqual(documentedPaths[documentedPaths.length - 1], '/Container/Leaf');
}

async function runRuntimePinnedLevelCase() {
  const { documentedPaths } = setupRuntimeDisplayFixture([
    '/Container',
    '/Container/Nested',
    '/Container/Nested/Leaf',
    '/Container/Nested/Leaf2',
  ]);

  UI.RuntimeControl.displayState('/Container/Nested/Leaf');
  UI.RuntimeControl.updateStateDisplayDepth('/Container/Nested');
  assert.strictEqual(documentedPaths[documentedPaths.length - 1], '/Container/Nested');

  UI.RuntimeControl.displayState('/Container/Nested/Leaf2');
  assert.strictEqual(
    documentedPaths[documentedPaths.length - 1],
    '/Container/Nested',
    'manual container level should stay pinned across sibling leaf updates'
  );

  UI.RuntimeControl.displayState('/Container');
  UI.RuntimeControl.displayState('/Container/Nested/Leaf');
  assert.strictEqual(
    documentedPaths[documentedPaths.length - 1],
    '/Container/Nested',
    'manual container level should survive a transient shallow path when fallback is cancelled'
  );

  UI.RuntimeControl.displayState('/Container');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.strictEqual(documentedPaths[documentedPaths.length - 1], '/Container');

  UI.RuntimeControl.displayState('/Container/Nested/Leaf2');
  assert.strictEqual(
    documentedPaths[documentedPaths.length - 1],
    '/Container/Nested/Leaf2',
    'manual pin should clear after execution exits above the pinned level'
  );
}

async function runRuntimePinnedStatusCleanupCase() {
  const { documentedPaths, statusNodes } = setupRuntimeDisplayFixture([
    '/Container',
    '/Container/Nested',
    '/Container/Nested/Leaf',
    '/Container/Nested/Leaf2',
  ]);

  UI.RuntimeControl.displayState('/Container/Nested/Leaf');
  UI.RuntimeControl.updateStateDisplayDepth('/Container/Nested');
  UI.RuntimeControl.drawStatusLabel('stale outcome request');
  const staleLabel = statusNodes[0];
  assert.strictEqual(staleLabel.removed, false);

  UI.RuntimeControl.displayState('/Container/Nested/Leaf2');

  assert.strictEqual(documentedPaths[documentedPaths.length - 1], '/Container/Nested');
  assert.strictEqual(
    staleLabel.removed,
    true,
    'pinned display updates should clear status labels that no longer match the displayed state'
  );
}

async function runRuntimeOutcomeRequestFocusCase() {
  const { documentedPaths, stateMap } = setupRuntimeDisplayFixture([
    '/Container',
    '/Container/Nested',
    '/Container/Nested/Leaf',
  ]);

  UI.RuntimeControl.displayState('/Container/Nested/Leaf');
  UI.RuntimeControl.updateStateDisplayDepth('/Container');
  assert.strictEqual(documentedPaths[documentedPaths.length - 1], '/Container');

  UI.RuntimeControl.displayOutcomeRequest(0, stateMap.get('/Container/Nested/Leaf'));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(
    documentedPaths[documentedPaths.length - 1],
    '/Container/Nested/Leaf',
    'operator outcome requests should jump from an upper container view to the blocked state'
  );
}

async function runControllerExternalPromptPreservesTerminalCase() {
  const { logs } = setupGlobals();

  let clearLogCalls = 0;
  let showCalls = 0;
  let keepOpenCalls = 0;
  T.clearLog = function() { clearLogCalls += 1; };
  T.show = function() { showCalls += 1; };
  T.keepOpen = function() { keepOpenCalls += 1; };

  global.RC.Sync = {
    STATUS_ERROR: 'error',
    STATUS_OK: 'ok',
    hasProcess() { return false; },
    setStatus() {},
    setProgress() {},
    register() {},
    remove() {},
  };
  UI.Menu.displayRuntimeStatus = function() {};
  UI.Menu.isPageStatemachine = function() { return false; };
  UI.RuntimeControl.displayEngineOffline = function() {};
  UI.RuntimeControl.displayNoBehavior = function() {};
  UI.RuntimeControl.displayExternalBehavior = function() {};
  UI.Dashboard.unsetReadonly = function() {};

  loadScript('flexbe_webui/app/rc/rc_controller.js');

  RC.Controller.initialize();
  RC.Controller.signalConnected();
  logs.length = 0;

  RC.Controller.signalExternal();

  assert.strictEqual(clearLogCalls, 0);
  assert.strictEqual(keepOpenCalls, 1);
  assert.strictEqual(showCalls, 1);
  assert.deepStrictEqual(logs.slice(-3), [
    { level: 'warn', message: 'Running behavior detected.' },
    { level: 'warn', message: 'Load the matching behavior, then use Attach in the Runtime Control tab to monitor execution.' },
    { level: 'warn', message: 'Click this terminal panel to close this notice.' },
  ]);
  assert.strictEqual(document.getElementById('button_behavior_attach_external').disabled, true);

  logs.length = 0;
  RC.Controller.signalBehavior();

  assert.strictEqual(clearLogCalls, 0);
  assert.strictEqual(keepOpenCalls, 2);
  assert.strictEqual(showCalls, 2);
  assert.deepStrictEqual(logs.slice(-3), [
    { level: 'warn', message: 'Running behavior detected.' },
    { level: 'warn', message: 'Use Attach in the Runtime Control tab to connect this UI to the running behavior.' },
    { level: 'warn', message: 'Click this terminal panel to close this notice.' },
  ]);
  assert.strictEqual(document.getElementById('button_behavior_attach_external').disabled, false);
}

async function runPubSubInactiveStateMapCase() {
  const { logs, consoleMessages, restoreConsole } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const subscribers = {};
  global.ROS = {
    Subscriber: function(topic, _type, callback) {
      subscribers[topic] = callback;
      this.close = function() {};
    },
    Publisher: function() {
      this.publish = function() {};
      this.close = function() {};
    },
  };

  const stateMap = new Map([[0, { path: '', state: undefined }]]);
  let behaviorId = undefined;
  global.Behavior.getStateMap = function() { return stateMap; };
  global.Behavior.getStatemachine = function() {
    return {
      getStateByPath() { return undefined; },
    };
  };
  global.Behavior.getBehaviorId = function() { return behaviorId; };
  global.Behavior.setBehaviorId = function(value) { behaviorId = value; };
  global.Behavior.getBehaviorName = function() { return ''; };
  global.Behavior.getManifestPath = function() { return '/tmp/loaded.xml'; };
  global.UI.Settings.isSynthesisEnabled = function() { return false; };
  global.UI.Settings.getVersion = function() { return 'test'; };

  global.RC.Controller = {
    isRunning() { return false; },
    isExternal() { return false; },
    isReadonly() { return false; },
  };

  try {
    loadScript('flexbe_webui/app/rc/rc_pubsub.js');
    RC.PubSub.initialize('/');

    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 123,
      state_ids: [655688960],
      state_paths: ['/RiverCrossing'],
    });

    assert.strictEqual(behaviorId, undefined);
    assert.strictEqual(stateMap.size, 1);
    assert.strictEqual(logs.some(entry => entry.level === 'error'), false);
    assert(
      consoleMessages.some(message => message.includes('state_map_callback: ignoring inactive state map for behavior_id=123')),
      `Expected inactive state-map console message, got ${JSON.stringify(consoleMessages)}`
    );
  } finally {
    restoreConsole();
  }
}

async function runPubSubOutcomeRequestBeforeStateMapCase() {
  const { consoleMessages, restoreConsole } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const subscribers = {};
  global.ROS = {
    Subscriber: function(topic, _type, callback) {
      subscribers[topic] = callback;
      this.close = function() {};
    },
    Publisher: function() {
      this.publish = function() {};
      this.close = function() {};
    },
  };

  const stateMap = new Map([[0, { path: '', state: undefined }]]);
  let behaviorId = undefined;
  const targetState = {
    stateId: undefined,
    getStateId() { return this.stateId; },
    setStateId(value) { this.stateId = value; },
    getStatePath() { return '/Demo/Wait'; },
  };
  const rootStateMachine = {
    getStatePath() { return ''; },
    getStateByPath(statePath) {
      return statePath === '/Demo/Wait' ? targetState : undefined;
    },
  };
  let outcomeDisplayCalls = 0;
  let displayedOutcome = undefined;
  let displayedState = undefined;
  global.Behavior.getStateMap = function() { return stateMap; };
  global.Behavior.getStatemachine = function() { return rootStateMachine; };
  global.Behavior.getBehaviorId = function() { return behaviorId; };
  global.Behavior.setBehaviorId = function(value) { behaviorId = value; };
  global.Behavior.getBehaviorName = function() { return 'Demo'; };
  global.Behavior.getManifestPath = function() { return '/tmp/demo.xml'; };
  global.UI.RuntimeControl.displayOutcomeRequest = function(outcome, state) {
    outcomeDisplayCalls += 1;
    displayedOutcome = outcome;
    displayedState = state;
  };
  global.UI.RuntimeControl.updateCurrentState = function() {};
  global.RC.Controller = {
    isRunning() { return true; },
    isExternal() { return false; },
    isReadonly() { return false; },
  };
  global.UI.Settings.isSynthesisEnabled = function() { return false; };
  global.UI.Settings.getVersion = function() { return 'test'; };

  try {
    loadScript('flexbe_webui/app/rc/rc_pubsub.js');
    RC.PubSub.initialize('/');

    subscribers['/flexbe/outcome_request']({
      target: 205916672,
      outcome: 0,
    });

    assert.strictEqual(outcomeDisplayCalls, 0);
    assert(
      consoleMessages.some(message => message.includes('Outcome request arrived before state map is ready')),
      `Expected state-map-not-ready console message, got ${JSON.stringify(consoleMessages)}`
    );
    assert.strictEqual(
      consoleMessages.some(message => message.includes('Error : cannot find state')),
      false
    );

    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 154,
      state_ids: [0, 205916672],
      state_paths: ['', '/Demo/Wait'],
    });

    assert.strictEqual(outcomeDisplayCalls, 1);
    assert.strictEqual(displayedOutcome, 0);
    assert.strictEqual(displayedState, targetState);

    stateMap.clear();
    stateMap.set(0, { path: '', state: rootStateMachine });
    behaviorId = 154;
    outcomeDisplayCalls = 0;
    subscribers['/flexbe/outcome_request']({
      target: 205916672,
      outcome: 0,
    });

    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 155,
      state_ids: [0, 205916672],
      state_paths: ['', '/Demo/Wait'],
    });

    assert.strictEqual(
      outcomeDisplayCalls,
      0,
      'stale pending outcome request from prior behavior id should not replay after behavior switch'
    );
  } finally {
    restoreConsole();
  }
}

async function runPubSubRejectsEmptyBehaviorStartCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const published = {};
  global.ROS = {
    Subscriber: function() {
      this.close = function() {};
    },
    Publisher: function(topic) {
      this.publish = function(msg) {
        if (!published[topic]) published[topic] = [];
        published[topic].push(msg);
      };
      this.close = function() {};
    },
  };

  global.UI.Settings.isSynthesisEnabled = function() { return false; };
  global.UI.Settings.getVersion = function() { return 'test'; };
  global.Behavior.createNames = function() {
    return {
      rosnode_name: 'flexbe_turtlesim_demo_flexbe_behaviors',
      behavior_name: '',
    };
  };
  global.Behavior.createStructureInfo = function() {
    throw new Error('createStructureInfo should not be called for invalid behavior name');
  };
  global.RC.Controller = {
    signalStarted() {
      throw new Error('signalStarted should not be called for invalid behavior name');
    },
  };

  loadScript('flexbe_webui/app/rc/rc_pubsub.js');
  RC.PubSub.initialize('/');

  const startButton = document.getElementById('button_behavior_start');
  startButton.disabled = true;
  RC.PubSub.sendBehaviorStart([], [], 0);

  assert.strictEqual(startButton.disabled, false);
  assert.deepStrictEqual(published['/flexbe/request_behavior'] || [], []);
  assertLog(logs, 'error', 'Cannot start behavior: behavior package or name is not set.');
}

async function runPubSubClearsFailedSessionRestoreCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = function() { return 1; };
  global.clearTimeout = function() {};

  const subscribers = {};
  global.ROS = {
    Subscriber: function(topic, _type, callback) {
      subscribers[topic] = callback;
      this.close = function() {};
    },
    Publisher: function() {
      this.publish = function() {};
      this.close = function() {};
    },
  };

  const apiPosts = [];
  global.API.get = function(action, callback) {
    assert.strictEqual(action, 'session/loaded_behavior');
    callback({
      success: true,
      data: {
        package: 'demo_pkg',
        behavior_name: 'DemoBehavior',
        manifest_path: '/tmp/demo.xml',
        codefile_name: 'demo_sm.py',
        editable: true,
      },
    });
  };
  global.API.post = function(action, content, callback) {
    apiPosts.push({ action, content });
    if (callback) callback({ success: true, data: null });
  };
  global.IO.BehaviorLoader.loadBehavior = function(manifest, callback, options) {
    assert.deepStrictEqual(manifest, {
      rosnode_name: 'demo_pkg',
      name: 'DemoBehavior',
      manifest_path: '/tmp/demo.xml',
      codefile_name: 'demo_sm.py',
      editable: true,
    });
    assert.deepStrictEqual(options, { clear_session: false, clear_terminal: false });
    callback('Failed to load behavior source');
  };

  global.UI.Settings.isSynthesisEnabled = function() { return false; };
  global.UI.Settings.getVersion = function() { return 'test'; };
  global.Behavior.getManifestPath = function() { return undefined; };
  global.Behavior.getBehaviorId = function() { return undefined; };
  global.RC.Sync = {
    setProgress() {},
  };
  global.RC.Controller = {
    onboardTimeout: 30,
    isRunning() { return true; },
    isExternal() { return false; },
    isReadonly() { return false; },
  };

  try {
    loadScript('flexbe_webui/app/rc/rc_pubsub.js');
    RC.PubSub.initialize('/');

    subscribers['/flexbe/heartbeat']({
      behavior_id: 42,
      current_state_checksums: [],
    });

    assert.deepStrictEqual(apiPosts, [{ action: 'session/loaded_behavior', content: null }]);
    assertLog(logs, 'warn', 'Session restore failed; clearing saved loaded behavior.');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

async function runSynthesisPayloadCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  global.ROS = {
    ActionClient: function(_topic, _actionType) {
      this.send_goal = function(goal) {
        sentGoal = goal;
      };
      this.close = function() {};
    },
  };
  let sentGoal = undefined;
  loadScript('flexbe_webui/app/rc/rc_pubsub.js');

  RC.PubSub.initializeSynthesisAction();

  RC.PubSub.requestBehaviorSynthesis(
    '/Container',
    'coffee_maker',
    'br_c',
    'bd_a',
    ['finished', 'failed'],
    function() {},
    function() {},
    function() {}
  );

  assert.deepStrictEqual(sentGoal, {
    request: {
      name: '/Container',
      spec_name: '/Container',
      system: 'coffee_maker',
      system_name: 'coffee_maker',
      goal: 'br_c',
      goals: ['br_c'],
      initial_condition: 'bd_a',
      initial_conditions: ['bd_a'],
      sm_outcomes: ['finished', 'failed'],
      specification_file_name: '',
    },
    synthesis_options: '',
  });
}

async function runSynthesisFormCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  const tabRefreshes = [];
  UI.Panels.STATE_PROPERTIES_PANEL = 'state_properties';
  UI.Panels.isActivePanel = function(panel) {
    return panel === UI.Panels.STATE_PROPERTIES_PANEL;
  };
  UI.Panels.updatePanelTabTargets = function(panel, subPanel) {
    tabRefreshes.push({ panel, subPanel });
  };

  const state = {
    getStatePath() { return '/Container'; },
    getOutcomes() { return ['finished', 'failed']; },
  };
  const schema = [
    {
      name: 'request',
      kind: 'message',
      fields: [
        { name: 'spec_name', kind: 'string', type: 'string' },
        { name: 'system_name', kind: 'string', type: 'string' },
        { name: 'goals', kind: 'sequence', type: 'sequence<string>', element_kind: 'string' },
        { name: 'initial_conditions', kind: 'sequence', type: 'sequence<string>', element_kind: 'string' },
        { name: 'sm_outcomes', kind: 'sequence', type: 'sequence<string>', element_kind: 'string' },
        { name: 'specification_file_name', kind: 'string', type: 'string' },
      ],
    },
    {
      name: 'synthesis_options',
      kind: 'string',
      type: 'string',
    },
  ];

  UI.Panels.StateProperties.DEBUG_renderSynthesisSchema(schema, state);

  assert(
    tabRefreshes.some(entry => entry.panel === UI.Panels.STATE_PROPERTIES_PANEL && entry.subPanel === 'statemachine'),
    `Expected synthesis render to refresh statemachine tab targets, got ${JSON.stringify(tabRefreshes)}`
  );

  assert.strictEqual(
    document.getElementById('input_prop_synthesis_request__spec_name').value,
    '/Container'
  );
  assert.strictEqual(
    document.getElementById('input_prop_synthesis_request__system_name').value,
    'coffee_maker'
  );
  assert.strictEqual(
    document.getElementById('input_prop_synthesis_request__sm_outcomes').value,
    'finished, failed'
  );

  document.getElementById('input_prop_synthesis_request__goals').value = 'br_c, br_d';
  document.getElementById('input_prop_synthesis_request__initial_conditions').value = 'bd_a, bd_b';
  document.getElementById('input_prop_synthesis_request__specification_file_name').value = 'spec.yaml';
  document.getElementById('input_prop_synthesis_synthesis_options').value = 'fast';

  const payload = UI.Panels.StateProperties.DEBUG_buildSynthesisPayload(schema, state);
  assert.deepStrictEqual(payload, {
    request: {
      spec_name: '/Container',
      system_name: 'coffee_maker',
      goals: ['br_c', 'br_d'],
      initial_conditions: ['bd_a', 'bd_b'],
      sm_outcomes: ['finished', 'failed'],
      specification_file_name: 'spec.yaml',
    },
    synthesis_options: 'fast',
  });
}

async function runStatePanelFlowsCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  UI.Panels.STATE_PROPERTIES_PANEL = 'state_properties';
  UI.Panels.setActivePanel = function() {};
  UI.Panels.hidePanelIfActive = function() {};
  UI.Panels.updatePanelTabTargets = function() {};
  UI.Panels.setFocus = function() {};

  ActivityTracer.ACT_STATE_CHANGE = 'state_change';
  ActivityTracer.addActivity = function() {};

  UI.RuntimeControl.resetParameterTableClicked = function() {};

  global.Statemachine = function() {};
  Statemachine.prototype.isConcurrent = function() { return false; };
  Statemachine.prototype.isPriority = function() { return false; };
  global.BehaviorState = function() {};

  const displayedSM = {
    isInsideDifferentBehavior() { return false; },
    getTransitions() { return []; },
  };
  UI.Statemachine.getDisplayedSM = function() {
    return displayedSM;
  };
  UI.Statemachine.refreshView = function() {};
  UI.Statemachine.isDataflow = function() { return false; };

  RC.Controller.isReadonly = function() { return false; };
  RC.Controller.isLocked = function() { return false; };
  RC.Controller.isStateLocked = function() { return false; };
  RC.Controller.isOnLockedPath = function() { return false; };
  Behavior.isReadonly = function() { return false; };

  const rootSM = {
    getStateByPath(pathValue) {
      if (pathValue === '/behavior_state') {
        return behaviorState;
      }
      if (pathValue === '/container_state') {
        return containerState;
      }
      return undefined;
    },
  };
  Behavior.getStatemachine = function() {
    return rootSM;
  };

  const behaviorDefinition = {
    getBehaviorDesc() { return 'Behavior description'; },
    getParamDesc() { return []; },
    getInputDesc() { return []; },
    getOutputDesc() { return []; },
    getOutcomeDesc() { return []; },
  };
  WS.Behaviorlib.getByName = function(name) {
    return name === 'DemoBehavior' ? behaviorDefinition : undefined;
  };
  WS.Behaviorlib.getByKey = function(pkg, name) {
    return name === 'DemoBehavior' ? behaviorDefinition : undefined;
  };

  const behaviorState = new BehaviorState();
  behaviorState.getStateName = function() { return 'Behavior State'; };
  behaviorState.getBehaviorName = function() { return 'DemoBehavior'; };
  behaviorState.getStatePackage = function() { return 'demo_pkg'; };
  behaviorState.getStatePath = function() { return '/behavior_state'; };
  behaviorState.getParameters = function() { return ['threshold']; };
  behaviorState.getParameterDefinition = function() {
    return { type: 'text', default: 'fallback', additional: [] };
  };
  behaviorState.getParameterValues = function() { return this.parameterValues; };
  behaviorState.parameterValues = [''];
  behaviorState.getOutcomes = function() { return []; };
  behaviorState.getAutonomy = function() { return []; };
  behaviorState.getInputKeys = function() { return ['userdata_key']; };
  behaviorState.getInputMapping = function() { return this.inputMapping; };
  behaviorState.inputMapping = ['configured_value'];
  behaviorState.getDefaultUserdataValue = function(key) { return `default:${key}`; };
  behaviorState.getOutputKeys = function() { return []; };
  behaviorState.getOutputMapping = function() { return []; };

  UI.Panels.StateProperties.displayStateProperties(behaviorState);
  UI.Panels.StateProperties.displayPropertiesForBehavior(behaviorState);
  assert.strictEqual(document.getElementById('panel_prop_be_parameters_content0').value, '');
  assert.strictEqual(document.getElementById('panel_prop_be_input_keys_content_0').value, 'configured_value');

  const parameterDefaultCheckbox = document.getElementById('panel_prop_be_parameters_default0');
  const parameterInput = document.getElementById('panel_prop_be_parameters_content0');
  parameterInput.parentNode = undefined;
  parameterDefaultCheckbox.checked = true;
  parameterDefaultCheckbox.dispatchEvent({ type: 'change', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(behaviorState.getParameterValues()[0], undefined);

  const inputDefaultCheckbox = document.getElementById('panel_prop_be_input_keys_content_0_default');
  const behaviorInputField = document.getElementById('panel_prop_be_input_keys_content_0');
  behaviorInputField.parentNode = undefined;
  inputDefaultCheckbox.checked = true;
  inputDefaultCheckbox.dispatchEvent({ type: 'change', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(behaviorState.getInputMapping()[0], undefined);

  const containerState = new Statemachine();
  containerState.getStateName = function() { return 'Container State'; };
  containerState.getStatePath = function() { return '/container_state'; };
  containerState.getOutcomes = function() { return []; };
  containerState.getAutonomy = function() { return []; };
  containerState.getInputKeys = function() { return this.inputKeys; };
  containerState.inputKeys = ['first', 'second'];
  containerState.getInputMapping = function() { return this.inputMapping; };
  containerState.inputMapping = ['shared', 'shared'];
  containerState.getOutputKeys = function() { return this.outputKeys; };
  containerState.outputKeys = ['out_first', 'out_second'];
  containerState.getOutputMapping = function() { return this.outputMapping; };
  containerState.outputMapping = ['done', 'done'];
  containerState.getStateType = function() { return 'missing_state_type'; };

  const plainState = {
    getStateName() { return 'Plain State'; },
    getStateClass() { return 'MissingState'; },
    getStatePackage() { return 'missing_pkg'; },
    getStateType() { return 'missing_state_type'; },
    getParameters() { return []; },
    getParameterValues() { return []; },
    getOutcomes() { return []; },
    getAutonomy() { return []; },
    getInputKeys() { return []; },
    getInputMapping() { return []; },
    getOutputKeys() { return []; },
    getOutputMapping() { return []; },
  };
  UI.Panels.StateProperties.displayPropertiesForState(plainState);
  assert.strictEqual(document.getElementById('label_prop_state_desc').innerText, '');

  UI.Panels.StateProperties.displayStateProperties(containerState);
  const removeInputButton = document.getElementById('panel_prop_sm_input_keys_content_first_remove');
  removeInputButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(containerState.getInputKeys(), ['second']);
  assert.deepStrictEqual(containerState.getInputMapping(), ['shared']);

  UI.Panels.StateProperties.displayStateProperties(containerState);
  const removeOutputButton = document.getElementById('panel_prop_sm_outcomes_content_out_first_remove');
  removeOutputButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(containerState.getOutputKeys(), ['out_second']);
  assert.deepStrictEqual(containerState.getOutputMapping(), ['done']);
}

async function runStatePropertiesEscapeCloseCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/ui/panels/ui_panels.js');

  document.getElementById('panel_properties').querySelectorAll = function() {
    return [];
  };
  document.getElementById('panel_properties_state').querySelectorAll = function() {
    return [];
  };

  let closeCount = 0;
  UI.Panels.StateProperties = {
    closePropertiesClicked() {
      closeCount += 1;
      UI.Panels.hidePanelIfActive(UI.Panels.STATE_PROPERTIES_PANEL);
    },
  };

  UI.Panels.setActivePanel(UI.Panels.STATE_PROPERTIES_PANEL, 'state');
  const panelEvent = {
    key: 'Escape',
    target: document.getElementById('panel_properties'),
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  UI.Panels.handleKeyDown(panelEvent);

  assert.strictEqual(closeCount, 1);
  assert.strictEqual(panelEvent.defaultPrevented, true);
  assert.strictEqual(panelEvent.propagationStopped, true);
  assert.strictEqual(UI.Panels.isActivePanel(UI.Panels.STATE_PROPERTIES_PANEL), false);

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');

  UI.Panels.setActivePanel(UI.Panels.STATE_PROPERTIES_PANEL, 'state');
  const statemachineEvent = {
    key: 'Escape',
    target: { id: 'statemachine' },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  UI.Statemachine.handleKeyDown(statemachineEvent);

  assert.strictEqual(closeCount, 2);
  assert.strictEqual(statemachineEvent.defaultPrevented, true);
  assert.strictEqual(statemachineEvent.propagationStopped, true);
  assert.strictEqual(UI.Panels.isActivePanel(UI.Panels.STATE_PROPERTIES_PANEL), false);
}

async function runStatePanelDuplicateGuardsCase() {
  const { acknowledgements } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  UI.Panels.STATE_PROPERTIES_PANEL = 'state_properties';
  UI.Panels.setActivePanel = function() {};
  UI.Panels.hidePanelIfActive = function() {};
  UI.Panels.updatePanelTabTargets = function() {};
  UI.Panels.setFocus = function() {};

  ActivityTracer.ACT_STATE_CHANGE = 'state_change';
  ActivityTracer.addActivity = function() {
    throw new Error('duplicate guard should not add history');
  };

  global.Statemachine = function() {};
  Statemachine.prototype.isConcurrent = function() { return false; };
  Statemachine.prototype.isPriority = function() { return false; };
  global.BehaviorState = function() {};

  const displayedSM = {
    isInsideDifferentBehavior() { return false; },
  };
  UI.Statemachine.getDisplayedSM = function() {
    return displayedSM;
  };
  UI.Statemachine.refreshView = function() {};
  UI.Statemachine.isDataflow = function() { return false; };

  RC.Controller.isReadonly = function() { return false; };
  RC.Controller.isLocked = function() { return false; };
  RC.Controller.isStateLocked = function() { return false; };
  RC.Controller.isOnLockedPath = function() { return false; };
  Behavior.isReadonly = function() { return false; };

  const containerState = new Statemachine();
  const outcomes = ['done'];
  const autonomy = [-1];
  const inputKeys = ['goal'];
  const inputMapping = ['goal'];
  const outputKeys = ['result'];
  const outputMapping = ['result'];

  containerState.getStateName = function() { return 'Container State'; };
  containerState.getStatePath = function() { return '/container_state'; };
  containerState.getOutcomes = function() { return outcomes; };
  containerState.getAutonomy = function() { return autonomy; };
  containerState.addOutcome = function(outcome) {
    outcomes.push(outcome);
    autonomy.push(-1);
  };
  containerState.getInputKeys = function() { return inputKeys; };
  containerState.getInputMapping = function() { return inputMapping; };
  containerState.getOutputKeys = function() { return outputKeys; };
  containerState.getOutputMapping = function() { return outputMapping; };

  Behavior.getStatemachine = function() {
    return {
      getStateByPath() {
        return containerState;
      },
    };
  };

  UI.Panels.StateProperties.displayStateProperties(containerState);

  document.getElementById('input_prop_outcome_add').value = 'done';
  await UI.Panels.StateProperties.addSMOutcome();
  assert.deepStrictEqual(outcomes, ['done']);

  document.getElementById('input_prop_input_key_add').value = 'goal';
  await UI.Panels.StateProperties.addSMInputKey();
  assert.deepStrictEqual(inputKeys, ['goal']);
  assert.deepStrictEqual(inputMapping, ['goal']);

  document.getElementById('input_prop_output_key_add').value = 'result';
  await UI.Panels.StateProperties.addSMOutputKey();
  assert.deepStrictEqual(outputKeys, ['result']);
  assert.deepStrictEqual(outputMapping, ['result']);

  assert(
    acknowledgements.some(message => message.includes("Outcome name 'done' already exists!")),
    `Expected duplicate outcome acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
  assert(
    acknowledgements.some(message => message.includes("Input key 'goal' already exists!")),
    `Expected duplicate input acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
  assert(
    acknowledgements.some(message => message.includes("Output key 'result' already exists!")),
    `Expected duplicate output acknowledgement, got ${JSON.stringify(acknowledgements)}`
  );
}

async function runStatePanelHoverDocumentationCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ws/ws_documentation.js');
  loadScript('flexbe_webui/app/ws/ws_statedefinition.js');
  loadScript('flexbe_webui/app/ws/ws_behaviorstatedefinition.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  const behaviorDefinition = new WS.BehaviorStateDefinition({
    rosnode_name: 'demo_pkg',
    codefile_name: 'demo_behavior_sm.py',
    class_name: 'DemoBehaviorSM',
    name: 'DemoBehavior',
    description: 'Demo behavior',
    tags: 'demo',
    params: [{
      name: 'mode',
      type: 'enum',
      default: 'safe',
      label: 'Mode <b>unsafe</b>',
      hint: 'Pick <img src=x onerror=window.hacked=true>',
      additional: ['safe', 'fast<script>alert(1)</script>'],
    }],
  }, [], [], []);

  WS.Behaviorlib.getByKey = function(pkg, name) {
    if (pkg === 'demo_pkg' && name === 'DemoBehavior') {
      return behaviorDefinition;
    }
    return undefined;
  };

  const hoverTarget = document.createElement('div');
  UI.Panels.StateProperties.addHoverDocumentation(
    hoverTarget, 'param', 'mode', undefined, 'DemoBehavior', 'demo_pkg'
  );
  hoverTarget.dispatchEvent({ type: 'mouseover', preventDefault() {}, stopPropagation() {} });

  const tooltip = document.getElementById('properties_tooltip');
  assert(tooltip);
  assert(document.body.children.includes(tooltip));
  assert.strictEqual(tooltip.children.length, 2);
  assert.strictEqual(tooltip.children[1].innerHTML, '');
  const tooltipText = flattenElementText(tooltip.children[1]);
  assert(tooltipText.includes('Default: "safe"'));
  assert(tooltipText.includes('Mode unsafe: Pick '));
  assert(tooltipText.includes('Possible values:'));
  assert(tooltipText.includes('- fast'));
  assert(!tooltipText.includes('<b>'));
  assert(!tooltipText.includes('<img'));
  assert(!tooltipText.includes('<script>'));

  hoverTarget.dispatchEvent({ type: 'mouseout', preventDefault() {}, stopPropagation() {} });
  document.setStrictElementLookup(true);
  assert.strictEqual(document.getElementById('properties_tooltip'), undefined);
  document.setStrictElementLookup(false);
}

async function runBehaviorSourceViewNestedPathCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  UI.Panels.STATE_PROPERTIES_PANEL = 'state_properties';
  UI.Panels.setActivePanel = function() {};
  UI.Panels.hidePanelIfActive = function() {};
  UI.Panels.updatePanelTabTargets = function() {};
  UI.Panels.setFocus = function() {};

  global.Statemachine = function() {};
  global.BehaviorState = function() {};

  let sourceRequest = undefined;
  UI.Tools.openFileInSourceViewer = function(jsonFileDict, sourceName, filePath) {
    sourceRequest = { jsonFileDict, sourceName, filePath };
  };

  WS.Behaviorlib.getByKey = function(pkg, name) {
    if (pkg === 'test_pkg' && name === 'Nested Behavior') {
      return {
        getBehaviorDesc() { return 'Nested behavior description'; },
      };
    }
    return undefined;
  };

  const behaviorState = new BehaviorState();
  behaviorState.getStateName = function() { return 'Nested Behavior State'; };
  behaviorState.getBehaviorName = function() { return 'Nested Behavior'; };
  behaviorState.getStatePackage = function() { return 'test_pkg'; };
  behaviorState.getStatePath = function() { return '/nested_behavior_state'; };
  behaviorState.getStateImport = function() { return 'test_pkg.nested.demo_behavior_sm'; };
  behaviorState.getParameters = function() { return []; };
  behaviorState.getParameterValues = function() { return []; };
  behaviorState.getOutcomes = function() { return []; };
  behaviorState.getAutonomy = function() { return []; };
  behaviorState.getInputKeys = function() { return []; };
  behaviorState.getInputMapping = function() { return []; };
  behaviorState.getOutputKeys = function() { return []; };
  behaviorState.getOutputMapping = function() { return []; };

  UI.Panels.StateProperties.displayStateProperties(behaviorState);
  UI.Panels.StateProperties.viewBehaviorSourceCode();

  assert.deepStrictEqual(sourceRequest, {
    jsonFileDict: {
      package: 'test_pkg',
      file: 'nested/demo_behavior_sm',
    },
    sourceName: 'Nested Behavior',
    filePath: 'test_pkg/nested/demo_behavior_sm.py',
  });
}

async function runBehaviorStateDefinitionNestedPathCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ws/ws_documentation.js');
  loadScript('flexbe_webui/app/ws/ws_statedefinition.js');
  loadScript('flexbe_webui/app/ws/ws_behaviorstatedefinition.js');

  const behaviorDefinition = new WS.BehaviorStateDefinition({
    rosnode_name: 'test_pkg',
    codefile_name: 'demo_behavior_sm.py',
    codefile_relpath: 'nested/demo_behavior_sm',
    class_name: 'DemoBehaviorSM',
    name: 'Nested Demo Behavior',
    description: 'Demo behavior',
    tags: 'demo',
    params: [],
  }, [], [], []);

  assert.strictEqual(behaviorDefinition.getStatePath(), 'test_pkg.nested.demo_behavior_sm');
}

async function runLibraryHoverPanelsSafeTextCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_selectbehavior.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_addstate.js');

  const behaviorDefinition = {
    getStatePackage() { return 'pkg_<b>demo</b>'; },
    getBehaviorTagList() { return ['mode <i>tag</i>', 'nav<img src=x onerror=1>']; },
    getParameters() { return ['goal <b>mode</b>']; },
    getParamDesc() { return [{ name: 'goal <b>mode</b>', type: 'text<script>alert(1)</script>' }]; },
    getInputKeys() { return ['goal<b>_pose</b>', '$internal']; },
    getInputDesc() { return [{ name: 'goal<b>_pose</b>', type: 'Pose<i>Stamped</i>' }]; },
    getOutputKeys() { return ['result<script>alert(1)</script>', '$hidden']; },
    getOutputDesc() { return [{ name: 'result<script>alert(1)</script>', type: 'Path<b>Msg</b>' }]; },
    getOutcomes() { return ['done<b>_now</b>', '$private']; },
  };

  const selectTarget = document.createElement('div');
  UI.Panels.SelectBehavior.addHoverDetails(selectTarget, behaviorDefinition);
  selectTarget.dispatchEvent({ type: 'mouseover', preventDefault() {}, stopPropagation() {} });

  const selectTooltip = document.getElementById('select_behavior_tooltip');
  assert(selectTooltip);
  assert.strictEqual(selectTooltip.innerHTML, '');
  const selectTooltipText = flattenElementText(selectTooltip);
  assert(selectTooltipText.includes('Package: pkg_demo'));
  assert(selectTooltipText.includes('Tags: mode tag, nav'));
  assert(selectTooltipText.includes('Parameters:  - goal mode  text'));
  assert(selectTooltipText.includes('Input Keys:  - goal_pose  PoseStamped'));
  assert(selectTooltipText.includes('Output Keys:  - result  PathMsg'));
  assert(selectTooltipText.includes('Outcomes:  - done_now'));
  assert(!selectTooltipText.includes('<b>'));
  assert(!selectTooltipText.includes('<img'));
  assert(!selectTooltipText.includes('<script>'));

  selectTarget.dispatchEvent({ type: 'mouseout', preventDefault() {}, stopPropagation() {} });
  document.setStrictElementLookup(true);
  assert.strictEqual(document.getElementById('select_behavior_tooltip'), undefined);
  document.setStrictElementLookup(false);

  const stateDefinition = {
    getStatePackage() { return 'state_<b>pkg</b>'; },
    getParameters() { return ['mode <b>setting</b>']; },
    getParamDesc() { return [{ name: 'mode <b>setting</b>', type: 'enum<script>alert(1)</script>' }]; },
    getInputKeys() { return ['input<b>_key</b>', '$internal']; },
    getInputDesc() { return [{ name: 'input<b>_key</b>', type: 'Pose<i>Stamped</i>' }]; },
    getOutputKeys() { return ['output<script>alert(1)</script>', '$internal']; },
    getOutputDesc() { return [{ name: 'output<script>alert(1)</script>', type: 'Result<b>Msg</b>' }]; },
    getOutcomes() { return ['done<b>_state</b>', '$hidden']; },
  };

  const addTarget = document.createElement('div');
  UI.Panels.AddState.addHoverDetails(addTarget, stateDefinition);
  addTarget.dispatchEvent({ type: 'mouseover', preventDefault() {}, stopPropagation() {} });

  const addTooltip = document.getElementById('add_state_tooltip');
  assert(addTooltip);
  assert.strictEqual(addTooltip.innerHTML, '');
  const addTooltipText = flattenElementText(addTooltip);
  assert(addTooltipText.includes('Package: state_pkg'));
  assert(addTooltipText.includes('Parameters:  - mode setting  enum'));
  assert(addTooltipText.includes('Input Keys:  - input_key  PoseStamped'));
  assert(addTooltipText.includes('Output Keys:  - output  ResultMsg'));
  assert(addTooltipText.includes('Outcomes:  - done_state'));
  assert(!addTooltipText.includes('<b>'));
  assert(!addTooltipText.includes('<img'));
  assert(!addTooltipText.includes('<script>'));

  addTarget.dispatchEvent({ type: 'mouseout', preventDefault() {}, stopPropagation() {} });
  document.setStrictElementLookup(true);
  assert.strictEqual(document.getElementById('add_state_tooltip'), undefined);
  document.setStrictElementLookup(false);

  global.WS.Behaviorlib = {
    getBehaviorList() {
      return [{
        getBehaviorManifest() {
          return {
            name: 'Navigate <b>Behavior</b>',
            description: 'Move to <i>goal</i><script>alert(1)</script>',
          };
        },
        getBehaviorName() { return 'Navigate Behavior'; },
        getStatePackage() { return 'demo_pkg'; },
        getBehaviorTagList() { return []; },
        getParameters() { return []; },
        getParamDesc() { return []; },
        getInputKeys() { return []; },
        getInputDesc() { return []; },
        getOutputKeys() { return []; },
        getOutputDesc() { return []; },
        getOutcomes() { return []; },
      }];
    },
  };
  global.WS.Statelib = {
    getFromLib() {
      return {
        getStatePackage() { return 'demo_pkg'; },
        getStateClass() { return 'Move<b>State</b>'; },
        getShortDesc() { return 'Use <i>safe</i> text<script>alert(1)</script>'; },
        getParameters() { return []; },
        getParamDesc() { return []; },
        getInputKeys() { return []; },
        getInputDesc() { return []; },
        getOutputKeys() { return []; },
        getOutputDesc() { return []; },
        getOutcomes() { return []; },
      };
    },
  };

  UI.Panels.SelectBehavior.displayBehaviors(WS.Behaviorlib.getBehaviorList(), true);
  const behaviorRow = document.getElementById('panel_select_behavior_selection_behavior_0');
  assert(behaviorRow);
  assert.strictEqual(behaviorRow.innerHTML, '');
  const behaviorRowText = flattenElementText(behaviorRow);
  assert(behaviorRowText.includes('Navigate Behavior'));
  assert(behaviorRowText.includes('Move to goal'));
  assert(!behaviorRowText.includes('<b>'));
  assert(!behaviorRowText.includes('<i>'));
  assert(!behaviorRowText.includes('<script>'));

  UI.Panels.AddState.displayStateTypes(['demo_pkg/MoveState']);
  const stateRow = document.getElementById('class_select_demo_pkg_Move<b>State</b>');
  assert(stateRow);
  assert.strictEqual(stateRow.innerHTML, '');
  const stateRowText = flattenElementText(stateRow);
  assert(stateRowText.includes('MoveState'));
  assert(stateRowText.includes('Use safe text'));
  assert(!stateRowText.includes('<b>'));
  assert(!stateRowText.includes('<i>'));
  assert(!stateRowText.includes('<script>'));
}

async function runBehaviorTagOverflowDropdownCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_selectbehavior.js');

  let filterChangedCount = 0;
  UI.Panels.updatePanelTabTargets = function() {};
  UI.Panels.SelectBehavior.behaviorFilterChanged = function() {
    filterChangedCount += 1;
  };

  document.getElementById('behavior_tag_filter').clientWidth = 120;
  document.getElementById('input_behavior_filter').value = '';

  const behaviors = [
    {
      getBehaviorManifest() { return { name: 'Behavior Alpha', description: 'First behavior' }; },
      getBehaviorName() { return 'Behavior Alpha'; },
      getBehaviorTagList() { return ['zeta']; },
    },
    {
      getBehaviorManifest() { return { name: 'Behavior Beta', description: 'Second behavior' }; },
      getBehaviorName() { return 'Behavior Beta'; },
      getBehaviorTagList() { return ['alpha']; },
    },
    {
      getBehaviorManifest() { return { name: 'Behavior Gamma', description: 'Third behavior' }; },
      getBehaviorName() { return 'Behavior Gamma'; },
      getBehaviorTagList() { return ['mu']; },
    },
  ];

  UI.Panels.SelectBehavior.displayBehaviors(behaviors, true);
  UI.Panels.SelectBehavior.updateTags();

  const overflow = document.getElementById('input_behavior_filter_overflow');
  assert(overflow, 'expected overflow dropdown when tag row runs out of space');
  assert.deepStrictEqual(
    overflow.options.slice(1).map(option => option.value),
    ['alpha', 'mu', 'zeta'],
    'overflow dropdown should expose the full tag list in sorted order'
  );

  overflow.value = 'mu';
  overflow.dispatchEvent({ type: 'change', preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(document.getElementById('input_behavior_filter').value, '+mu');
  assert.strictEqual(filterChangedCount, 1, 'selecting an overflow tag should trigger filtering');
}

async function runApiClientCase() {
  setupGlobals();

  let abortCalled = false;
  let replacedUrl = undefined;
  global.location = {
    href: 'http://127.0.0.1:8000/?token=secret-token&mode=test#top',
  };
  global.history = {
    replaceState(_state, _title, url) {
      replacedUrl = url;
    },
  };
  global.AbortController = function() {
    this.signal = {};
    this.abort = function() {
      abortCalled = true;
    };
  };

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalConsoleWarn = console.warn;
  let consoleWarnCalls = 0;
  global.setTimeout = function(callback) {
    return { callback };
  };
  global.clearTimeout = function() {};
  console.warn = function() {
    consoleWarnCalls += 1;
  };

  try {
    loadScript('flexbe_webui/app/api.js');
    assert.strictEqual(localStorage.getItem('flexbe_webui_api_token'), 'secret-token');
    assert.strictEqual(replacedUrl, '/?mode=test#top');

    const fetchCalls = [];
    global.fetch = function() {
      fetchCalls.push(arguments);
      return Promise.resolve({
        ok: true,
        status: 200,
        text() {
          return Promise.resolve('not json');
        },
      });
    };

    const invalidJsonResult = await new Promise(resolve => {
      API.get('broken', resolve);
    });
    assert.strictEqual(invalidJsonResult.success, false);
    assert.strictEqual(invalidJsonResult.error, 'invalid JSON response');
    assert.strictEqual(invalidJsonResult.status, 200);
    assert.strictEqual(invalidJsonResult.raw_text, 'not json');
    assert.strictEqual(fetchCalls[0][1].headers.Authorization, 'Bearer secret-token');
    assert.strictEqual(fetchCalls[0][1].headers['X-API-Token'], 'secret-token');

    const circular = {};
    circular.self = circular;
    const stringifyFailure = await new Promise(resolve => {
      API.post('broken_post', circular, resolve);
    });
    assert.strictEqual(stringifyFailure.success, false);
    assert(stringifyFailure.error.includes('circular'));

    global.fetch = function(url, options) {
      fetchCalls.push([url, options]);
      return Promise.resolve({
        ok: true,
        status: 200,
        text() {
          return Promise.resolve(JSON.stringify({
            success: true,
            data: { ok: true, value: 42 },
            error: null,
            status: 200,
          }));
        },
      });
    };

    const flagSuccess = await new Promise((resolve, reject) => {
      API.postFlag('flag_ok', { value: 1 },
        () => resolve(true),
        error => reject(new Error(error)));
    });
    assert.strictEqual(flagSuccess, true);
    const latestFetch = fetchCalls[fetchCalls.length - 1];
    assert.strictEqual(latestFetch[1].headers.Authorization, 'Bearer secret-token');
    assert.strictEqual(latestFetch[1].headers['X-API-Token'], 'secret-token');
    assert.strictEqual(latestFetch[1].headers['Content-Type'], 'application/json');

    const dataSuccess = await new Promise((resolve, reject) => {
      API.postData('data_ok', { value: 1 },
        data => resolve(data),
        error => reject(new Error(error)));
    });
    assert.deepStrictEqual(dataSuccess, { ok: true, value: 42 });

    global.fetch = function() {
      return Promise.resolve({
        ok: true,
        status: 200,
        text() {
          return Promise.resolve(JSON.stringify({ legacy_value: 42 }));
        },
      });
    };

    const legacyObjectResult = await new Promise(resolve => {
      API.get('legacy_object', resolve);
    });
    assert.strictEqual(legacyObjectResult.success, true);
    assert.deepStrictEqual(legacyObjectResult.data, { legacy_value: 42 });
    assert.strictEqual(consoleWarnCalls, 0);
    assert.strictEqual(abortCalled, false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    console.warn = originalConsoleWarn;
  }
}

async function runHelperFlowsCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/autocomplete.js');
  loadScript('flexbe_webui/app/_helper/varsolver.js');

  const rootContainer = {
    getStateName() { return ''; },
    getInputKeys() { return ['container_input']; },
    getOutputKeys() { return ['container_output']; },
    updateDataflow() {},
    getStates() { return []; },
  };
  const childState = {
    getContainer() { return rootContainer; },
    getStateName() { return 'ChildState'; },
  };

  Behavior.getDefaultUserdata = function() {
    return [{ key: 'root_input', value: "'demo'" }];
  };
  Behavior.getInterfaceOutputKeys = function() {
    return ['root_output'];
  };
  Behavior.getPrivateVariables = function() {
    return [{ key: 'alias_bool', value: 'True' }];
  };

  const inputSuggestions = Autocomplete.generateInputUserdata('root', childState);
  assert.deepStrictEqual(inputSuggestions, [{
    text: 'root_input',
    hint: 'available',
    fill: 'root_input',
  }]);

  const outputSuggestions = Autocomplete.generateOutputUserdata('root', childState);
  assert(outputSuggestions.some(entry => (
    entry.text === 'root_output'
    && entry.hint === 'statemachine output'
    && entry.fill === 'root_output'
  )));

  assert.strictEqual(VarSolver.resolveVar('1', true), '1');
  assert.strictEqual(VarSolver.resolveVar('-1.5', true), '-1.5');
  assert.strictEqual(VarSolver.resolveVar('.5', true), '.5');
  assert.strictEqual(VarSolver.resolveVar('True', true), 'True');
  assert.strictEqual(VarSolver.resolveVar('False', true), 'False');
  assert.strictEqual(VarSolver.resolveVar('1a2', true), false);
  assert.strictEqual(VarSolver.resolveVar('TrueValue', true), false);
  assert.strictEqual(VarSolver.resolveVar('XFalse', true), false);
  assert.strictEqual(VarSolver.resolveVar('alias_bool', true), 'True');
}

async function runHelperDragCacheCase() {
  setupGlobals();
  global.Drawable = {};

  function makeAttrTarget(initialAttrs) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        if (Array.isArray(arg)) {
          const values = {};
          arg.forEach(key => {
            values[key] = attrs[key];
          });
          return values;
        }
        Object.assign(attrs, arg);
        return this;
      },
      getAttrs() {
        return attrs;
      },
    };
  }

  let otherBBoxCalls = 0;
  let dragIndicatorBBoxCalls = 0;

  const dragIndicator = makeAttrTarget({ x: 0, y: 0, width: 1, height: 1, opacity: 0 });
  dragIndicator.getBBox = function() {
    dragIndicatorBBoxCalls += 1;
    const attrs = dragIndicator.getAttrs();
    return {
      x: attrs.x,
      y: attrs.y,
      x2: attrs.x + attrs.width,
      y2: attrs.y + attrs.height,
      width: attrs.width,
      height: attrs.height,
    };
  };

  const draggedState = {
    getStateName() { return 'Dragged'; },
    getPosition() { return { x: 0, y: 0 }; },
  };
  const otherState = {
    getStateName() { return 'Other'; },
  };
  const selfDrawing = {
    getBBox() {
      throw new Error('self drawing should not be measured for drag cache');
    },
  };
  const otherDrawing = {
    getBBox() {
      otherBBoxCalls += 1;
      return {
        x: 50,
        y: 50,
        x2: 90,
        y2: 90,
        width: 40,
        height: 40,
      };
    },
  };

  global.UI.Statemachine = {
    isConnecting() { return false; },
    getPanShift() { return { x: 0, y: 0 }; },
    getAllDrawings() {
      return [
        { obj: draggedState, drawing: selfDrawing },
        { obj: otherState, drawing: otherDrawing },
      ];
    },
    getR() { return { width: 400, height: 400 }; },
    getDragIndicator() { return dragIndicator; },
  };
  global.Raphael = {
    isBBoxIntersect(a, b) {
      return !(
        a.x2 < b.x || a.x > b.x2
        || a.y2 < b.y || a.y > b.y2
      );
    },
  };

  loadScript('flexbe_webui/app/drawable/drawable_helper.js');

  const box = makeAttrTarget({ width: 40, height: 40 });
  const context = {
    data(key) {
      if (key === 'state') {
        return draggedState;
      }
      if (key === 'box') {
        return box;
      }
      throw new Error(`Unexpected key ${key}`);
    },
  };

  Drawable.Helper.startFnc.call(context);
  Drawable.Helper.moveFnc.call(context, 45, 45, 0, 0, { shiftKey: false });
  Drawable.Helper.moveFnc.call(context, 48, 48, 0, 0, { shiftKey: false });

  assert.strictEqual(otherBBoxCalls, 1);
  assert.strictEqual(dragIndicatorBBoxCalls, 2);
  assert.strictEqual(dragIndicator.getAttrs().stroke, '#F00');
}

async function runDrawableStateBoxLayerCase() {
  setupGlobals();

  const inserted = [];
  const sentToBack = [];

  function makeShape(type, text) {
    return {
      type,
      text,
      attr() { return this; },
      data() { return this; },
      click() { return this; },
      dblclick() { return this; },
      drag() { return this; },
      push() { return this; },
      translate() { return this; },
      getBBox() {
        return { width: text ? text.length * 6 : 80, height: 20 };
      },
      insertBefore(target) {
        inserted.push({ shape: this, target });
        return this;
      },
      toBack() {
        sentToBack.push(this);
        return this;
      },
    };
  }

  const paper = {
    set() {
      return {
        push() { return this; },
        translate() { return this; },
      };
    },
    text(_x, _y, text) {
      return makeShape('text', text);
    },
    rect() {
      return makeShape('rect');
    },
    image() {
      return makeShape('image');
    },
  };

  global.Drawable = {
    Helper: {
      scaled(value) { return value; },
      getTextWeight() { return 400; },
      getNodeStrokeWidth() { return 1; },
      viewStateProperties() {},
      enterBehavior() {},
      enterStatemachine() {},
      beginTransition() {},
      moveFnc() {},
      startFnc() {},
      endFnc() {},
      initialIntersectCheck() {},
    },
  };

  const baseState = {
    getStateName() { return 'StateName'; },
    getStateClass() { return 'StateClass'; },
    getStatePackage() { return 'state_pkg'; },
    getPosition() { return { x: 0, y: 0 }; },
    getOutcomesUnconnected() { return []; },
  };

  loadScript('flexbe_webui/app/drawable/drawable_state.js');
  new Drawable.State(baseState, paper, false, Drawable.State.Mode.SIMPLE, false, false);

  const behaviorState = Object.assign({}, baseState, {
    getBehaviorName() { return 'BehaviorName'; },
  });
  loadScript('flexbe_webui/app/drawable/drawable_behaviorstate.js');
  new Drawable.BehaviorState(behaviorState, paper, false, Drawable.State.Mode.SIMPLE, false, false);

  const containerState = Object.assign({}, baseState, {
    isConcurrent() { return false; },
    isPriority() { return false; },
    getStates() { return []; },
  });
  loadScript('flexbe_webui/app/drawable/drawable_statemachine.js');
  new Drawable.Statemachine(containerState, paper, false, Drawable.State.Mode.SIMPLE, false, false);

  assert.strictEqual(sentToBack.length, 0, 'state boxes should not be sent behind the canvas background');
  assert.strictEqual(inserted.filter(entry => entry.shape.type === 'rect').length, 5);
  inserted
    .filter(entry => entry.shape.type === 'rect')
    .forEach(entry => assert.strictEqual(entry.target.text, 'StateName'));
}

async function runStatemachineBeginTransitionCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        if (Array.isArray(arg)) {
          const values = {};
          arg.forEach(key => {
            values[key] = attrs[key];
          });
          return values;
        }
        Object.assign(attrs, arg);
        return this;
      },
      drag() { return this; },
      mousemove() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate() { return this; },
      transform() { return ''; },
      remove() {},
    };
  }

  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      rect() {
        return makeShape({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
      },
      circle() {
        return makeShape({ cx: 0, cy: 0, opacity: 0 });
      },
      path() {
        return makeShape();
      },
      remove() {},
    };
  };

  global.Transition = function(from, to, outcome, autonomy) {
    this.getFrom = function() { return from; };
    this.getTo = function() { return to; };
    this.getOutcome = function() { return outcome; };
    this.getAutonomy = function() { return autonomy; };
  };

  Behavior.getStatemachine = function() {
    return {
      getStates() { return []; },
    };
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();

  let refreshCalls = 0;
  UI.Statemachine.refreshView = function() {
    refreshCalls += 1;
  };

  const state = {
    getOutcomes() { return ['done']; },
    getAutonomy() { return [7]; },
  };

  UI.Statemachine.beginTransition(state, 'done');

  assert.strictEqual(refreshCalls, 1);
  assert.strictEqual(UI.Statemachine.isConnecting(), true);
}

async function runStatemachineSelectionCacheCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let selectionArea;

  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        if (Array.isArray(arg)) {
          const values = {};
          arg.forEach(key => {
            values[key] = attrs[key];
          });
          return values;
        }
        Object.assign(attrs, arg);
        return this;
      },
      data() { return this; },
      drag() { return this; },
      mousemove() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate() { return this; },
      transform() { return ''; },
      hide() { return this; },
      show() { return this; },
      remove() {},
      isPointInside(x, y) {
        return x >= attrs.x && x <= attrs.x + attrs.width
          && y >= attrs.y && y <= attrs.y + attrs.height;
      },
    };
  }

  let rectCalls = 0;
  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      rect() {
        rectCalls += 1;
        const shape = makeShape({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
        if (rectCalls === 2) {
          selectionArea = shape;
        }
        return shape;
      },
      circle() {
        return makeShape({ cx: 0, cy: 0, opacity: 0 });
      },
      path() {
        return makeShape();
      },
      remove() {},
    };
  };

  global.State = function(name) {
    this.getStateName = function() { return name; };
    this.getStateClass = function() { return ':INIT'; };
  };

  const insideState = {
    getStateName() { return 'Inside'; },
    getPosition() { return { x: 10, y: 10 }; },
    getStateClass() { return 'Simple'; },
  };
  const outsideState = {
    getStateName() { return 'Outside'; },
    getPosition() { return { x: 200, y: 200 }; },
    getStateClass() { return 'Simple'; },
  };

  Behavior.getStatemachine = function() {
    return {
      getStates() { return [insideState, outsideState]; },
      getSMOutcomes() { return []; },
      getTransitions() { return []; },
      getDataflow() { return []; },
      getCommentNotes() { return []; },
      getStatePath() { return ''; },
      updateDataflow() {},
      isInsideDifferentBehavior() { return false; },
    };
  };
  Behavior.getCommentNotes = function() {
    return [];
  };
  Behavior.isReadonly = function() {
    return false;
  };
  RC.Controller.isRunning = function() {
    return false;
  };
  RC.Controller.isCurrentState = function() {
    return false;
  };
  RC.Controller.isLocked = function() {
    return false;
  };
  RC.Controller.isOnLockedPath = function() {
    return false;
  };
  RC.Controller.isReadonly = function() {
    return false;
  };
  UI.Menu.isPageStatemachine = function() {
    return false;
  };

  global.Drawable = {
    Transition: function() {},
    Outcome: function() {
      this.obj = { getStateName() { return 'OUTCOME'; }, getPosition() { return { x: 0, y: 0 }; } };
      this.drawing = makeShape();
    },
    ContainerPath: function() {
      this.obj = {};
      this.drawing = makeShape();
    },
    State: function(state) {
      this.obj = state;
      this.drawing = makeShape();
      this.drawing.cached_bbox = { width: 40, height: 30 };
      this.drawing.getBBox = function() {
        throw new Error('selection should not call getBBox for cached state drawings');
      };
    },
    BehaviorState: function() {},
    Statemachine: function() {},
  };
  global.Drawable.State.Mode = {
    OUTCOME: 'outcome',
  };
  global.Drawable.Transition.PATH_CURVE = 'curve';
  global.Drawable.Helper = {
    endPointClick() {},
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();
  UI.Statemachine.refreshView();

  selectionArea.attr({ opacity: 1, x: 0, y: 0, width: 100, height: 100 });
  const selectedStates = UI.Statemachine.getSelectedStates();

  assert.deepStrictEqual(selectedStates.map(state => state.getStateName()), ['Inside']);
}

async function runStatemachineConnectThrottleCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let background;
  const rafCallbacks = [];

  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        if (Array.isArray(arg)) {
          const values = {};
          arg.forEach(key => {
            values[key] = attrs[key];
          });
          return values;
        }
        Object.assign(attrs, arg);
        return this;
      },
      drag() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate() { return this; },
      transform() { return ''; },
      remove() {},
      mousemove(handler) {
        this.mousemoveHandler = handler;
        return this;
      },
      triggerMousemove(event) {
        this.mousemoveHandler(event);
      },
    };
  }

  let rectCalls = 0;
  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      rect() {
        rectCalls += 1;
        const shape = makeShape({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
        if (rectCalls === 3) {
          background = shape;
        }
        return shape;
      },
      circle() {
        return makeShape({ cx: 0, cy: 0, opacity: 0 });
      },
      path() {
        return makeShape();
      },
      remove() {},
    };
  };
  global.requestAnimationFrame = function(callback) {
    rafCallbacks.push(callback);
  };

  global.Transition = function(from, to, outcome, autonomy) {
    this.getFrom = function() { return from; };
    this.getTo = function() { return to; };
    this.getOutcome = function() { return outcome; };
    this.getAutonomy = function() { return autonomy; };
  };

  Behavior.getStatemachine = function() {
    return {
      getStates() { return []; },
    };
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();

  let refreshCalls = 0;
  UI.Statemachine.refreshView = function() {
    refreshCalls += 1;
  };

  const state = {
    getOutcomes() { return ['done']; },
    getAutonomy() { return [0]; },
  };

  UI.Statemachine.beginTransition(state, 'done');
  refreshCalls = 0;

  background.triggerMousemove({ offsetX: 10, offsetY: 15 });
  background.triggerMousemove({ offsetX: 20, offsetY: 25 });

  assert.strictEqual(rafCallbacks.length, 1);
  assert.strictEqual(refreshCalls, 0);

  rafCallbacks[0]();

  assert.strictEqual(refreshCalls, 1);
}

async function runStatemachineHomeEndPanCase() {
  setupGlobals();

  const bindings = new Map();
  global.Mousetrap = {
    bind(key, handler, type) {
      bindings.set(key, handler);
      if (type) {
        bindings.set(`${type}:${key}`, handler);
      }
    },
  };
  let background;
  const paths = [];

  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        Object.assign(attrs, arg);
        return this;
      },
      data() { return this; },
      drag(moveHandler, startHandler, endHandler) {
        this.dragMove = moveHandler;
        this.dragStart = startHandler;
        this.dragEnd = endHandler;
        return this;
      },
      mousemove() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate(dx, dy) {
        attrs.translateX = (attrs.translateX || 0) + dx;
        attrs.translateY = (attrs.translateY || 0) + dy;
        return this;
      },
      transform() { return this; },
      hide() { return this; },
      show() { return this; },
      remove() {},
      getBBox() {
        return {
          x: attrs.x,
          y: attrs.y,
          width: attrs.width,
          height: attrs.height,
          x2: attrs.x + attrs.width,
          y2: attrs.y + attrs.height,
        };
      },
    };
  }

  let rectCalls = 0;
  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      rect() {
        rectCalls += 1;
        const shape = makeShape({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
        if (rectCalls === 3) {
          background = shape;
        }
        return shape;
      },
      circle() {
        return makeShape({ cx: 0, cy: 0, opacity: 0 });
      },
      path() {
        const shape = makeShape();
        paths.push(shape);
        return shape;
      },
      remove() {},
    };
  };

  global.State = function(name) {
    this.name = name;
    this.position = { x: 0, y: 0 };
    this.getStateName = function() { return this.name; };
    this.getPosition = function() { return this.position; };
    this.setPosition = function(position) { this.position = position; };
    this.getStateClass = function() { return 'Simple'; };
    this.getStatePath = function() { return this.name; };
  };

  const near = new State('Near');
  near.setPosition({ x: 50, y: 60 });
  const far = new State('Far');
  far.setPosition({ x: 650, y: 450 });
  const terminal = new State('finished');
  terminal.setPosition({ x: 700, y: 520 });

  Behavior.getStatemachine = function() {
    return {
      getStates() { return [near, far]; },
      getSMOutcomes() { return [terminal]; },
      getTransitions() { return []; },
      getDataflow() { return []; },
      getStatePath() { return ''; },
      updateDataflow() {},
      isInsideDifferentBehavior() { return false; },
    };
  };
  Behavior.getCommentNotes = function() {
    return [];
  };
  Behavior.isReadonly = function() {
    return false;
  };
  RC.Controller.isRunning = function() {
    return false;
  };
  RC.Controller.isCurrentState = function() {
    return false;
  };
  RC.Controller.isLocked = function() {
    return false;
  };
  RC.Controller.isOnLockedPath = function() {
    return false;
  };
  RC.Controller.isReadonly = function() {
    return false;
  };
  UI.Menu.isPageStatemachine = function() {
    return true;
  };

  global.Drawable = {
    Transition: function() {},
    Outcome: function(outcome) {
      this.obj = outcome;
      const pos = outcome.getPosition();
      this.drawing = makeShape({ x: pos.x, y: pos.y, width: 220, height: 70 });
    },
    ContainerPath: function() {
      this.obj = {};
      this.drawing = makeShape();
    },
    State: function(state) {
      this.obj = state;
      const pos = state.getPosition();
      const width = state.getStateName() === 'Far' ? 240 : 80;
      this.drawing = makeShape({ x: pos.x, y: pos.y, width, height: 80 });
    },
    BehaviorState: function() {},
    Statemachine: function() {},
  };
  global.Drawable.State.Mode = {
    OUTCOME: 'outcome',
  };
  global.Drawable.Transition.PATH_CURVE = 'curve';
  global.Drawable.Helper = {
    endPointClick() {},
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();
  UI.Statemachine.refreshView();

  assert(bindings.has('home'), 'Expected Home pan binding');
  assert(bindings.has('ctrl+home'), 'Expected Ctrl+Home pan binding');
  assert(bindings.has('end'), 'Expected End pan binding');
  assert(bindings.has('ctrl+end'), 'Expected Ctrl+End pan binding');
  assert(bindings.has('shift+home'), 'Expected Shift+Home pan binding');
  assert(bindings.has('shift+end'), 'Expected Shift+End pan binding');

  bindings.get('ctrl+end')();
  assert.deepStrictEqual(UI.Statemachine.getPanShift(), { x: -570, y: -340 });

  bindings.get('ctrl+home')();
  assert.deepStrictEqual(UI.Statemachine.getPanShift(), { x: 0, y: 0 });

  bindings.get('keydown:shift')();
  assert(paths.length > 0, 'Expected Shift to create pan grid');
  paths.forEach((path) => assert.strictEqual(path.attr('pointer-events'), 'none'));
  background.dragStart(100, 100, {});
  background.dragMove(-40, -30, 60, 70, {});
  background.dragEnd({});
  assert.deepStrictEqual(UI.Statemachine.getPanShift(), { x: -40, y: -30 });
  paths.forEach((path) => assert.strictEqual(path.attr('pointer-events'), 'none'));
  bindings.get('keyup:shift')();
}

async function runStatemachineFitViewCase() {
  setupGlobals();

  const bindings = new Map();
  global.Mousetrap = {
    bind(key, handler) {
      bindings.set(key, handler);
    },
  };

  let canvasClickHandler;
  const canvasAttrs = {};
  const canvas = {
    setAttribute(name, value) {
      canvasAttrs[name] = value;
    },
    getAttribute(name) {
      return canvasAttrs[name];
    },
    removeAttribute(name) {
      delete canvasAttrs[name];
    },
    addEventListener(type, handler) {
      if (type === 'click') {
        canvasClickHandler = handler;
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 400, height: 300 };
    },
  };

  const rects = [];
  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({ x: 0, y: 0, width: 0, height: 0 }, initialAttrs);
    return {
      cached_bbox: initialAttrs.cached_bbox,
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        if (Array.isArray(arg)) {
          const values = {};
          arg.forEach(key => {
            values[key] = attrs[key];
          });
          return values;
        }
        Object.assign(attrs, arg);
        return this;
      },
      data() { return this; },
      drag() { return this; },
      mousemove() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate(dx, dy) {
        attrs.x += dx;
        attrs.y += dy;
        return this;
      },
      transform() { return ''; },
      hide() { return this; },
      show() { return this; },
      remove() {},
      getBBox() {
        return {
          x: attrs.x,
          y: attrs.y,
          width: attrs.width,
          height: attrs.height,
          x2: attrs.x + attrs.width,
          y2: attrs.y + attrs.height,
        };
      },
      isPointInside(x, y) {
        return x >= attrs.x && x <= attrs.x + attrs.width
          && y >= attrs.y && y <= attrs.y + attrs.height;
      },
    };
  }

  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      canvas,
      rect(x = 0, y = 0, width = 0, height = 0) {
        const shape = makeShape({ x, y, width, height, opacity: 0 });
        rects.push(shape);
        return shape;
      },
      circle(cx = 0, cy = 0, radius = 0) {
        return makeShape({ x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2, cx, cy, opacity: 0 });
      },
      path() {
        return makeShape();
      },
      remove() {},
    };
  };

  global.State = function(name, x, y) {
    this.name = name;
    this.position = { x, y };
    this.getStateName = function() { return this.name; };
    this.getPosition = function() { return this.position; };
    this.setPosition = function(position) { this.position = position; };
    this.getStateClass = function() { return 'Simple'; };
    this.getStatePath = function() { return this.name; };
  };

  const near = new State('Near', 60, 70);
  const far = new State('Far', 920, 130);

  Behavior.getStatemachine = function() {
    return {
      getStates() { return [near, far]; },
      getSMOutcomes() { return []; },
      getTransitions() { return []; },
      getDataflow() { return []; },
      getStatePath() { return ''; },
      updateDataflow() {},
      isInsideDifferentBehavior() { return false; },
    };
  };
  Behavior.getCommentNotes = function() {
    return [];
  };
  Behavior.isReadonly = function() {
    return false;
  };
  RC.Controller.isRunning = function() {
    return false;
  };
  RC.Controller.isCurrentState = function() {
    return false;
  };
  RC.Controller.isLocked = function() {
    return false;
  };
  RC.Controller.isOnLockedPath = function() {
    return false;
  };
  RC.Controller.isReadonly = function() {
    return false;
  };
  UI.Menu.isPageStatemachine = function() {
    return true;
  };

  global.Drawable = {
    Transition: function() {},
    Outcome: function() {},
    ContainerPath: function() {
      this.obj = {};
      this.drawing = makeShape({ x: 0, y: 0, width: 120, height: 20 });
    },
    State: function(state) {
      this.obj = state;
      const pos = state.getPosition();
      this.drawing = makeShape({ x: pos.x, y: pos.y, width: 80, height: 40 });
      this.drawing.cached_bbox = { width: 80, height: 40 };
    },
    BehaviorState: function() {},
    Statemachine: function() {},
  };
  global.Drawable.State.Mode = {
    OUTCOME: 'outcome',
  };
  global.Drawable.Transition.PATH_CURVE = 'curve';
  global.Drawable.Helper = {
    endPointClick() {},
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();
  UI.Statemachine.refreshView();

  assert(bindings.has('ctrl+0'), 'Expected Ctrl+0 fit view binding');
  assert.strictEqual(UI.Statemachine.isFitView(), false);

  bindings.get('ctrl+0')({ preventDefault() {} });

  assert.strictEqual(UI.Statemachine.isFitView(), true);
  assert.strictEqual(UI.Statemachine.isReadonly(), true);
  assert(canvasAttrs.viewBox, 'Expected Fit View to set an SVG viewBox');
  assert(canvasAttrs.viewBox.split(/\s+/).map(Number)[2] > 400, 'Expected Fit View to zoom out for wide content');
  assert.strictEqual(document.getElementById('fit_view_overlay').style.display, 'block');
  assert.strictEqual(typeof canvasClickHandler, 'function');
  assert.strictEqual(rects[2].attr('opacity'), 0, 'Expected Fit View background rect to be visually hidden');
  assert.strictEqual(rects[2].attr('pointer-events'), 'auto');
  const fitPanIndicator = rects.find(rect => rect.attr('stroke') === '#cfd6df');
  assert(fitPanIndicator, 'Expected Fit View to create a prior-viewport pan indicator');
  assert.strictEqual(fitPanIndicator.attr('pointer-events'), 'none');
  assert.strictEqual(fitPanIndicator.attr('width'), 400);
  assert.strictEqual(fitPanIndicator.attr('height'), 300);

  bindings.get('end')();

  assert.strictEqual(UI.Statemachine.isFitView(), false);
  assert.strictEqual(canvasAttrs.viewBox, undefined);
  assert.strictEqual(document.getElementById('fit_view_overlay').style.display, 'none');
  assert.strictEqual(rects[2].attr('opacity'), 1, 'Expected regular view background rect to be visible again');
  assert.strictEqual(rects[2].attr('pointer-events'), 'auto');
  assert.strictEqual(fitPanIndicator.attr('width'), 0);
  assert.strictEqual(fitPanIndicator.attr('height'), 0);
  assert(UI.Statemachine.getPanShift().x < 0, 'Expected End to exit Fit View and pan to canvas extents');

  bindings.get('ctrl+0')({ preventDefault() {} });

  canvasClickHandler({
    offsetX: 350,
    offsetY: 120,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });

  assert.strictEqual(UI.Statemachine.isFitView(), false);
  assert.strictEqual(canvasAttrs.viewBox, undefined);
  assert.strictEqual(document.getElementById('fit_view_overlay').style.display, 'none');
  assert(UI.Statemachine.getPanShift().x < 0, 'Expected click-to-focus to pan toward the clicked SVG point');

  bindings.get('ctrl+0')({ preventDefault() {} });

  canvasClickHandler({
    offsetX: 350,
    offsetY: 290,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });

  assert.strictEqual(UI.Statemachine.isFitView(), false);
  assert.strictEqual(
    UI.Statemachine.getPanShift().y,
    0,
    'Expected click-to-focus below a shallow fit view to keep the state machine vertically visible'
  );
}

async function runValidationReportCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  global.T.show = function() {};

  let saveCalls = 0;
  const saveOptions = [];
  global.IO.BehaviorSaver = {
    saveStateMachine(options) {
      saveCalls += 1;
      saveOptions.push(options || {});
    },
  };

  global.Behavior.isReadonly = function() {
    return false;
  };
  global.Behavior.getFileName = function() {
    return undefined;
  };
  global.Behavior.getBehaviorName = function() {
    return 'Demo';
  };

  global.Checking = {
    checkBehaviorReport() {
      return {
        fatal_errors: [],
        warnings: ['non-fatal warning'],
        info: [],
      };
    },
  };

  global.ActivityTracer.addSave = function() {};
  global.UI.Tools.customSaveWithRenameDecision = async function() {
    return 'save';
  };

  loadScript('flexbe_webui/app/ui/ui_menu.js');

  await UI.Menu.saveBehaviorClicked();
  assert.strictEqual(saveCalls, 1);
  assert.strictEqual(saveOptions[0].save_as, false);
  assert.strictEqual(saveOptions[0].keep_terminal_open, true);
  assertLog(logs, 'warn', 'Saving with 1 non-fatal validation warning');
  assertLog(logs, 'warn', 'non-fatal warning');

  logs.length = 0;
  global.Checking.checkBehaviorReport = function() {
    return {
      fatal_errors: ['fatal validation error'],
      warnings: [],
      info: [],
    };
  };

  await UI.Menu.saveBehaviorClicked();
  assert.strictEqual(saveCalls, 1);
  assertLog(logs, 'error', 'Unable to save behavior: fatal validation error');

  logs.length = 0;
  global.Checking.checkBehaviorReport = function() {
    return {
      fatal_errors: [],
      warnings: [],
      info: [],
    };
  };
  global.Behavior.getFileName = function() {
    return 'nested/demo_sm.py';
  };
  global.Behavior.getBehaviorName = function() {
    return 'Demo';
  };
  let renameDecisionCalls = 0;
  global.UI.Tools.customSaveWithRenameDecision = async function() {
    renameDecisionCalls += 1;
    return 'save_as';
  };

  await UI.Menu.saveBehaviorClicked();
  assert.strictEqual(saveCalls, 2);
  assert.strictEqual(renameDecisionCalls, 0);
  assert.strictEqual(saveOptions[1].save_as, false);

  logs.length = 0;
  global.Checking.checkBehaviorReport = function() {
    return {
      fatal_errors: [],
      warnings: ['warning a', 'warning b'],
      info: [],
    };
  };

  UI.Menu.checkBehaviorClicked();
  assertLog(logs, 'warn', 'Behavior is valid with 2 non-fatal warning');
}

async function runValidationStyleSuggestionInfoCase() {
  const { logs, consoleMessages, restoreConsole } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/checking.js');

  const stateName = '0_move_goat';
  let statemachine;
  const state = {
    getStateName() { return stateName; },
    getStatePath() { return `/${stateName}`; },
    getParameters() { return []; },
    getParameterValues() { return []; },
    getInputKeys() { return []; },
    getInputMapping() { return []; },
    getOutputKeys() { return []; },
    getOutputMapping() { return []; },
    getContainer() { return statemachine; },
    getOutcomes() { return []; },
    getOutcomesUnconnected() { return []; },
  };
  statemachine = {
    getStateName() { return ''; },
    getStatePath() { return ''; },
    getStates() { return [state]; },
    getInitialState() { return state; },
    getDataflow() { return []; },
    getInputKeys() { return []; },
    getTransitions() { return []; },
    updateDataflow() {},
    isConcurrent() { return false; },
  };

  global.Behavior.getBehaviorName = function() { return 'Demo'; };
  global.Behavior.getBehaviorDescription = function() { return 'Demo behavior'; };
  global.Behavior.getAuthor = function() { return 'tester'; };
  global.Behavior.getPrivateVariables = function() { return []; };
  global.Behavior.getDefaultUserdata = function() { return []; };
  global.Behavior.getBehaviorParameters = function() { return []; };
  global.Behavior.getInterfaceOutcomes = function() { return ['finished']; };
  global.Behavior.getInterfaceInputKeys = function() { return []; };
  global.Behavior.getInterfaceOutputKeys = function() { return []; };
  global.Behavior.getManualCodeImport = function() { return []; };
  global.Behavior.getCreationDate = function() { return '2026-05-08'; };
  global.Behavior.getTags = function() { return 'test'; };
  global.Behavior.getStatemachine = function() { return statemachine; };
  global.Behavior.createStructureInfo = function() {};

  try {
    const report = Checking.checkBehaviorReport();
    const message = `State '${stateName}' does not follow suggested InitialCapitals style naming`;

    assert.deepStrictEqual(report.fatal_errors, []);
    assert(report.info.includes(message), `Expected style suggestion info, got ${JSON.stringify(report.info)}`);
    assert.strictEqual(report.warnings.includes(message), false);
    assert.strictEqual(logs.some(entry => entry.message.includes(message)), false);
    assert.strictEqual(consoleMessages.some(entry => entry.includes(message)), false);
  } finally {
    restoreConsole();
  }
}

async function runEventsFlowsCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const counters = {
    dashboard: 0,
    variableAdd: 0,
    checkboxChange: 0,
  };
  const noteSaveEvents = [];
  const mousetrapBindings = [];

  const callableMousetrap = function(_element) {
    return {
      bind(key, handler) {
        mousetrapBindings.push({ key, handler });
      },
    };
  };
  callableMousetrap.bind = function(key, handler) {
    mousetrapBindings.push({ key, handler });
  };
  global.Mousetrap = callableMousetrap;
  global.addEventListener = function() {};

  Object.assign(global.Tools, {
    copy() {},
    cut() {},
    paste() {},
    copyClicked() {},
    cutClicked() {},
    dfgClicked() {},
    handleTopLevelKeyDown() {},
    handleTopLevelKeyUp() {},
    pasteClicked() {},
    redoClicked() {},
    saveClicked() {},
    terminalClicked() {},
    undoClicked() {},
  });
  Object.assign(global.UI.Tools, {
    copyClicked() {},
    cutClicked() {},
    dfgClicked() {},
    handleTopLevelKeyDown() {},
    handleTopLevelKeyUp() {},
    pasteClicked() {},
    redoClicked() {},
    saveClicked() {},
    terminalClicked() {},
    undoClicked() {},
  });
  Object.assign(global.UI.Menu, {
    handleKeyDown() {},
    handleKeyUp() {},
    loadBehaviorClicked() {},
    resize() {},
    saveBehaviorClicked() {},
    setupTabHandling() {},
    toControlClicked() {},
    toSettingsClicked() {},
    toStatemachineClicked() {},
    configureKeybindings() {},
    toDashboardClicked() {
      counters.dashboard += 1;
    },
  });
  Object.assign(global.UI.Feed, { showAbout() {} });
  Object.assign(global.UI.Dashboard, {
    addBehaviorOutcomeClicked() {},
    addDefaultUserdataClicked() {},
    addInterfaceInputKeyClicked() {},
    addInterfaceOutputKeyClicked() {},
    addManualImportClicked() {},
    addParameterClicked() {},
    addPrivateVariableClicked() {
      counters.variableAdd += 1;
    },
    behaviorAuthorChanged() {},
    behaviorDateChanged() {},
    behaviorDescriptionChanged() {},
    behaviorNameChanged() {},
    behaviorPackageChanged() {},
    behaviorTagsChanged() {},
    editManualCreateClicked() {},
    editManualInitClicked() {},
    editPrivateFunctionClicked() {},
    handleKeyDown() {},
    handleKeyUp() {},
    setupTabHandling() {},
  });
  Object.assign(global.UI.Statemachine, {
    abortTransition() {},
    handleKeyDown() {},
    handleKeyUp() {},
    recreateDrawingArea() {},
    removeSelection() {},
    removeTransition() {},
  });
  Object.assign(global.UI.RuntimeControl, {
    allowPreemptClicked() {},
    attachExternalClicked() {},
    autonomySelectionChanged() {},
    behaviorLockClicked() {},
    connectClicked() {},
    handleKeyDown() {},
    handleKeyUp() {},
    pauseBehaviorClicked() {},
    preemptBehaviorClicked() {},
    recreateDrawingArea() {},
    repeatBehaviorClicked() {},
    resetParameterTableClicked() {},
    setupTabHandling() {},
    startBehaviorClicked() {},
    syncMirrorClicked() {},
    toggleSyncExtension() {},
  });
  Object.assign(global.UI.Settings, {
    allowEditorsChanged() {},
    codeIndentationChanged() {},
    collapseErrorClicked() {},
    collapseHintClicked() {},
    collapseInfoClicked() {},
    collapseWarnClicked() {},
    commandsEnabledClicked() {},
    commandsKeyChanged() {},
    dashboardTextBoldClicked() {},
    dashboardTextSizeChanged() {},
    defaultPackageChanged() {},
    editorCommandChanged() {},
    encodingChanged() {},
    explicitStatesClicked() {},
    forceDiscoverClicked() {},
    gridsizeChanged() {},
    handleKeyDown() {},
    handleKeyUp() {},
    licenseChanged() {},
    licenseFileChanged() {},
    pkgCacheEnabledClicked() {},
    rosConnectClicked() {},
    runtimeTimeoutChanged() {},
    saveInSourceClicked() {},
    setupTabHandling() {},
    sourceCodeRootChanged() {},
    statemachineTextBoldClicked() {
      counters.checkboxChange += 1;
    },
    statemachineTextExtraBoldClicked() {},
    statemachineTextSizeChanged() {},
    stopBehaviorsClicked() {},
    synthesisEnabledClicked() {},
    synthesisSystemChanged() {},
    synthesisTopicChanged() {},
    synthesisTypeChanged() {},
    transitionEndpointsChanged() {},
    transitionLineWidthBoldChanged() {},
    transitionLineWidthExtraBoldChanged() {},
    transitionLineWidthNormalChanged() {},
  });
  global.UI.Panels.AddState = {
    addStateCancelClicked() {},
    addStateConfirmClicked() {},
    filterChanged() {},
  };
  global.UI.Panels.SelectBehavior = {
    behaviorFilterChanged() {},
    behaviorSelectCancelClicked() {},
  };
  global.UI.Panels.StateProperties = {
    addSMInputKey() {},
    addSMOutcome() {},
    addSMOutputKey() {},
    applyPropertiesClicked() {},
    closePropertiesClicked() {},
    containerTypeChanged() {},
    deleteStateClicked() {},
    displaySynthesisClicked() {},
    openBehavior() {},
    openStatemachine() {},
    statePropNameChanged() {},
    synthesizeClicked() {},
    viewBehaviorSourceCode() {},
    viewStateSourceCode() {},
  };
  Object.assign(global.UI.Panels.Terminal, {
    hide() {},
    toggle() {},
  });
  global.UI.Panels.setFocus = function() {};
  global.ActivityTracer.undo = function() {};
  global.ActivityTracer.redo = function() {};

  document.addEventListener = function(type, handler) {
    if (type === 'DOMContentLoaded') {
      handler();
    }
  };

  loadScript('flexbe_webui/app/events.js');

  const pageButton = document.getElementById('button_to_db');
  pageButton.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.strictEqual(counters.dashboard, 1);

  const variableInput = document.getElementById('input_db_variable_key_add');
  variableInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.strictEqual(counters.variableAdd, 1);

  const checkbox = document.getElementById('cb_statemachine_text_bold');
  checkbox.checked = false;
  checkbox.dispatchEvent({ type: 'keydown', key: ' ' });
  assert.strictEqual(checkbox.checked, true);
  assert.strictEqual(counters.checkboxChange, 1);

  const noteSaveButton = document.getElementById('button_note_editor_save');
  noteSaveButton.addEventListener('click', event => {
    noteSaveEvents.push(event.detail);
  });
  const shiftEnterBinding = mousetrapBindings.find(entry => entry.key === 'shift+enter');
  assert(shiftEnterBinding, 'Expected note editor shift+enter binding');
  shiftEnterBinding.handler();
  assert.deepStrictEqual(noteSaveEvents, ['shift+enter']);
}

async function runTerminalSafeTextCase() {
  setupGlobals();
  let activePanel;
  global.UI.Panels.TERMINAL_PANEL = 'terminal';
  global.UI.Panels.setActivePanel = function(panel) {
    activePanel = panel;
  };
  global.UI.Panels.hidePanelIfActive = function(panel) {
    if (activePanel === panel) {
      activePanel = undefined;
    }
  };
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ui/panels/ui_panels_terminal.js');

  const terminal = document.getElementById('terminal');
  const hostileMessage = '<img src=x onerror=alert(1)> & <b>bold</b>';

  T.logInfo(hostileMessage);

  assert.strictEqual(terminal.children.length, 1);
  assert.strictEqual(terminal.children[0].textContent, hostileMessage);
  assert.strictEqual(terminal.children[0].style.color, 'white');
  assert.strictEqual(terminal.innerHTML, '');

  T.clearLog();

  assert.strictEqual(terminal.children.length, 0);

  T.show();
  assert.strictEqual(activePanel, 'terminal');
  T.keepOpen();
  T.hideIfClean();
  assert.strictEqual(activePanel, 'terminal', 'Pinned terminal should remain open during clean auto-hide');
  T.hide();
  assert.strictEqual(activePanel, undefined);

  T.show();
  T.hideIfClean();
  assert.strictEqual(activePanel, undefined, 'Clean unpinned terminal should auto-hide');
}

async function runRemainingHtmlSinksSafeTextCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/tools.js');
  loadScript('flexbe_webui/app/ui/ui_runtimecontrol.js');

  const hostileStateType = '<img src=x onerror=alert(1)>';
  const hostileFilePath = '/tmp/<b>demo</b>.py';
  const trustedCodeHtml = '<div class="code"><span>trusted highlight</span></div>';
  const sourceDocument = {
    body: makeElement('source-body'),
    title: '',
    written: '',
    open() {},
    write(html) {
      this.written += html;
    },
    close() {},
    createElement(tag) {
      const element = makeElement(tag);
      element.tagName = tag.toUpperCase();
      return element;
    },
  };
  window.open = function() {
    return { document: sourceDocument };
  };

  Tools.viewSource(hostileStateType, hostileFilePath, trustedCodeHtml);

  assert(!sourceDocument.written.includes(hostileStateType));
  assert(!sourceDocument.written.includes(hostileFilePath));
  assert.strictEqual(sourceDocument.title, hostileStateType);
  assert.strictEqual(sourceDocument.body.children[0].children[0].textContent,
    hostileStateType + ' : ' + hostileFilePath);
  assert.strictEqual(sourceDocument.body.children[1].innerHTML, trustedCodeHtml);

  ActivityTracer.getCurrentIndex = function() { return 0; };
  ActivityTracer.getActivityList = function() {
    return [
      { description: '<svg onload=alert(1)>changed outcome</svg>' },
      { description: 'future <b>entry</b>' },
    ];
  };
  ActivityTracer.setUpdateCallback = function(callback) {
    this.updateCallback = callback;
  };

  UI.RuntimeControl.displayNoBehavior();

  const history = document.getElementById('rc_save_history');
  assert.strictEqual(history.innerHTML, '');
  assert.strictEqual(history.children.length, 1);
  assert.strictEqual(history.children[0].children[0].textContent,
    '<svg onload=alert(1)>changed outcome</svg>');
  assert.strictEqual(history.children[0].children[1].textContent, 'future <b>entry</b>');
  assert.strictEqual(history.children[0].children[1].style.textDecoration, 'line-through');
}

async function runCommandUpdateBehaviorCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let refreshCount = 0;
  let notifyCount = 0;
  let updateEntryArg = undefined;

  global.RC.Controller = {
    isReadonly() { return false; },
  };

  global.UI.Menu = {
    isPageStatemachine() { return true; },
  };

  global.UI.Statemachine = {
    refreshView() {
      refreshCount += 1;
    },
  };

  global.UI.Tools.notifyRosCommand = function(command) {
    if (command === 'update') {
      notifyCount += 1;
    }
  };

  global.BehaviorState = function(stateClass, manifestDescription, statePackage = 'demo_pkg', behaviorName = 'Demo Behavior') {
    this.stateClass = stateClass;
    this.manifestDescription = manifestDescription;
    this.statePackage = statePackage;
    this.behaviorName = behaviorName;
    this.outcomes = ['old_done'];
    this.inputKeys = ['old_input'];
    this.outputKeys = ['old_output'];
  };
  global.BehaviorState.prototype.getStateClass = function() {
    return this.stateClass;
  };
  global.BehaviorState.prototype.getStatePackage = function() {
    return this.statePackage;
  };
  global.BehaviorState.prototype.getBehaviorName = function() {
    return this.behaviorName;
  };
  global.BehaviorState.prototype.getBehaviorManifest = function() {
    return { description: this.manifestDescription };
  };
  global.BehaviorState.prototype.getOutcomes = function() {
    return this.outcomes;
  };
  global.BehaviorState.prototype.getInputKeys = function() {
    return this.inputKeys;
  };
  global.BehaviorState.prototype.getOutputKeys = function() {
    return this.outputKeys;
  };
  global.BehaviorState.prototype.updateBehaviorDefinition = function(newDef) {
    this.stateClass = newDef.getStateClass();
    this.manifestDescription = newDef.getBehaviorManifest().description;
    this.outcomes = newDef.getOutcomes().slice();
    this.inputKeys = newDef.getInputKeys().slice();
    this.outputKeys = newDef.getOutputKeys().slice();
  };

  const nestedBehavior = new global.BehaviorState('demo_pkg/DemoBehavior', 'old manifest', 'demo_pkg', 'Demo Behavior');
  const siblingBehavior = new global.BehaviorState('other_pkg/DemoBehavior', 'other manifest', 'other_pkg', 'Demo Behavior');
  global.Behavior.getStatemachine = function() {
    return {
      getStates() {
        return [nestedBehavior, siblingBehavior];
      },
    };
  };

  const existingEntry = {
    getBehaviorName() {
      return 'Demo Behavior';
    },
    getStatePackage() {
      return 'demo_pkg';
    },
    getBehaviorManifest() {
      return { name: 'Demo Behavior' };
    },
  };
  const updatedEntry = {
    getBehaviorName() { return 'Demo Behavior'; },
    getStatePackage() { return 'demo_pkg'; },
    getStateClass() { return 'demo_pkg/DemoBehavior'; },
    getBehaviorManifest() { return { description: 'new manifest' }; },
    getOutcomes() { return ['new_done', 'new_failed']; },
    getInputKeys() { return ['new_input']; },
    getOutputKeys() { return ['new_output']; },
  };

  global.WS.Behaviorlib = {
    getByName(name) {
      assert.strictEqual(name, 'Demo Behavior');
      return existingEntry;
    },
    getByKey(pkg, name) {
      return existingEntry;
    },
    getBehaviorList() {
      return [existingEntry];
    },
    updateEntry(entry, callback) {
      updateEntryArg = entry;
      callback(updatedEntry);
    },
  };

  loadScript('flexbe_webui/app/_helper/command_lib.js');
  const updateCommand = CommandLib.load().find(entry => entry.desc === 'update [behavior]');
  assert(updateCommand, 'Expected update command to be registered');

  updateCommand.impl(['update Demo Behavior', 'Demo Behavior']);

  assert.strictEqual(updateEntryArg, existingEntry);
  assert.deepStrictEqual(nestedBehavior.getOutcomes(), ['new_done', 'new_failed']);
  assert.deepStrictEqual(nestedBehavior.getInputKeys(), ['new_input']);
  assert.deepStrictEqual(nestedBehavior.getOutputKeys(), ['new_output']);
  assert.strictEqual(nestedBehavior.getBehaviorManifest().description, 'new manifest');
  assert.deepStrictEqual(siblingBehavior.getOutcomes(), ['old_done']);
  assert.deepStrictEqual(siblingBehavior.getInputKeys(), ['old_input']);
  assert.deepStrictEqual(siblingBehavior.getOutputKeys(), ['old_output']);
  assert.strictEqual(siblingBehavior.getBehaviorManifest().description, 'other manifest');
  assert.strictEqual(refreshCount, 1);
  assert.strictEqual(notifyCount, 1);
}

async function runBehaviorlibUpdateSyncCallbackCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const existingManifest = {
    name: 'Demo Behavior',
    class_name: 'DemoBehaviorSM',
    codefile_content: 'old content',
  };
  const fullManifest = {
    name: 'Demo Behavior',
    class_name: 'DemoBehaviorSM',
    codefile_content: 'new content',
  };
  const existingEntry = {
    getBehaviorName() { return 'Demo Behavior'; },
    getStatePackage() { return 'demo_pkg'; },
    getBehaviorManifest() { return existingManifest; },
  };

  global.IO.BehaviorLoader.ensureFullContent = function(manifest, callback) {
    assert.strictEqual(manifest, existingManifest);
    assert.strictEqual(manifest.codefile_content, '');
    callback(fullManifest);
  };
  global.IO.BehaviorLoader.loadBehaviorInterface = function(manifest, callback) {
    assert.strictEqual(manifest, fullManifest);
    callback({
      class_name: 'DemoBehaviorSM',
      smi_outcomes: ['finished'],
      smi_input: ['request'],
      smi_output: ['result'],
    });
  };

  global.WS.BehaviorStateDefinition = function(manifest, outcomes, inputKeys, outputKeys, readyCallback) {
    this.manifest = manifest;
    this.outcomes = outcomes;
    this.inputKeys = inputKeys;
    this.outputKeys = outputKeys;
    if (readyCallback != undefined) {
      setTimeout(readyCallback, 0);
    }
  };
  global.WS.BehaviorStateDefinition.prototype.getBehaviorName = function() {
    return this.manifest.name;
  };
  global.WS.BehaviorStateDefinition.prototype.getStatePackage = function() {
    return 'demo_pkg';
  };
  global.WS.BehaviorStateDefinition.prototype.getBehaviorManifest = function() {
    return this.manifest;
  };
  global.WS.BehaviorStateDefinition.prototype.getOutcomes = function() {
    return this.outcomes;
  };
  global.WS.BehaviorStateDefinition.prototype.getInputKeys = function() {
    return this.inputKeys;
  };
  global.WS.BehaviorStateDefinition.prototype.getOutputKeys = function() {
    return this.outputKeys;
  };

  loadScript('flexbe_webui/app/ws/ws_behaviorlib.js');
  WS.Behaviorlib.addToLib(existingEntry);

  let callbackEntry = undefined;
  let callbackSawPushedEntry = false;
  await new Promise(function(resolve) {
    WS.Behaviorlib.updateEntry(existingEntry, function(updatedEntry) {
      callbackEntry = updatedEntry;
      callbackSawPushedEntry = WS.Behaviorlib.getBehaviorList()[0] === updatedEntry;
      resolve();
    });
  });

  assert(callbackEntry, 'Expected update callback to receive the updated behavior entry');
  assert.strictEqual(callbackEntry.getBehaviorManifest(), fullManifest);
  assert.deepStrictEqual(callbackEntry.getOutcomes(), ['finished']);
  assert.deepStrictEqual(callbackEntry.getInputKeys(), ['request']);
  assert.deepStrictEqual(callbackEntry.getOutputKeys(), ['result']);
  assert.strictEqual(callbackSawPushedEntry, true);
  assert.strictEqual(WS.Behaviorlib.getBehaviorList().length, 1);
}

async function runBehaviorStateDefinitionNestedPathCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/ws/ws_documentation.js');
  loadScript('flexbe_webui/app/ws/ws_statedefinition.js');
  loadScript('flexbe_webui/app/ws/ws_behaviorstatedefinition.js');

  const definition = new WS.BehaviorStateDefinition({
    name: 'Nested Child',
    description: 'Nested child behavior.',
    tags: '',
    rosnode_name: 'child_pkg',
    class_name: 'NestedChildSM',
    codefile_name: 'child_sm',
    codefile_relpath: 'nested/child_sm',
    params: [],
  }, ['done'], ['request'], ['result']);

  assert.strictEqual(definition.getStatePath(), 'child_pkg.nested.child_sm');
  assert.strictEqual(definition.getStatePackage(), 'child_pkg');
  assert.strictEqual(definition.getStateType(), 'child_pkg.NestedChildSM');

  const definitionWithExtension = new WS.BehaviorStateDefinition({
    name: 'Nested Child',
    description: 'Nested child behavior.',
    tags: '',
    rosnode_name: 'child_pkg',
    class_name: 'NestedChildSM',
    codefile_name: 'child_sm.py',
    codefile_relpath: 'nested/child_sm.py',
    params: [],
  }, ['done'], [], []);

  assert.strictEqual(definitionWithExtension.getStatePath(), 'child_pkg.nested.child_sm');
}

async function runCommandQualifiedBehaviorCase() {
  const { logs } = setupGlobals();
  let loadedManifest = undefined;
  let dashboardCount = 0;

  global.RC.Controller = {
    isRunning() { return false; },
    isReadonly() { return false; },
  };
  global.UI.Menu = {
    toDashboardClicked() {
      dashboardCount += 1;
    },
  };
  global.IO.BehaviorLoader = {
    loadBehavior(manifest) {
      loadedManifest = manifest;
    },
  };

  const entryA = {
    getBehaviorName() { return 'Demo Behavior'; },
    getStatePackage() { return 'pkg_a'; },
    getBehaviorManifest() { return { name: 'Demo Behavior', rosnode_name: 'pkg_a' }; },
  };
  const entryB = {
    getBehaviorName() { return 'Demo Behavior'; },
    getStatePackage() { return 'pkg_b'; },
    getBehaviorManifest() { return { name: 'Demo Behavior', rosnode_name: 'pkg_b' }; },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'pkg_a' && name === 'Demo Behavior') {
        return entryA;
      }
      if (pkg === 'pkg_b' && name === 'Demo Behavior') {
        return entryB;
      }
      return undefined;
    },
    getBehaviorList() {
      return [entryA, entryB];
    },
  };

  loadScript('flexbe_webui/app/_helper/command_lib.js');
  const loadCommand = CommandLib.load().find(entry => entry.desc === 'load [behavior]');
  assert(loadCommand, 'Expected load command to be registered');

  loadCommand.impl(['load Demo Behavior', 'Demo Behavior']);
  assert.strictEqual(loadedManifest, undefined);
  assertLog(logs, 'error', "Behavior name 'Demo Behavior' is ambiguous.");

  loadCommand.impl(['load pkg_b::Demo Behavior', 'pkg_b::Demo Behavior']);
  assert.deepStrictEqual(loadedManifest, { name: 'Demo Behavior', rosnode_name: 'pkg_b' });
  assert.strictEqual(dashboardCount, 1);
}

async function runCommandAutoLayoutCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let autoLayoutCount = 0;
  let notifyCount = 0;

  global.UI.Menu = {
    autoLayoutClicked() {
      autoLayoutCount += 1;
    },
  };
  global.UI.Statemachine = {
    isReadonly() { return false; },
  };
  global.UI.Tools.notifyRosCommand = function(command) {
    if (command === 'autolayout') {
      notifyCount += 1;
    }
  };

  loadScript('flexbe_webui/app/_helper/command_lib.js');
  const autoLayoutCommand = CommandLib.load().find(entry => entry.desc === 'autolayout');
  assert(autoLayoutCommand, 'Expected autolayout command to be registered');

  autoLayoutCommand.impl(['autolayout']);

  assert.strictEqual(autoLayoutCount, 1);
  assert.strictEqual(notifyCount, 1);
}

async function runBehaviorCollisionResolutionCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/ws/ws_behaviorlib.js');
  loadScript('flexbe_webui/app/io/io_modelgenerator.js');

  let pkgACount = 0;
  let pkgBCount = 0;

  WS.Behaviorlib.addToLib({
    getStatePackage() { return 'pkg_a'; },
    getBehaviorName() { return 'Shared Behavior'; },
    getStateClass() {
      pkgACount += 1;
      return 'SharedSM';
    },
  });
  WS.Behaviorlib.addToLib({
    getStatePackage() { return 'pkg_b'; },
    getBehaviorName() { return 'Shared Behavior'; },
    getStateClass() {
      pkgBCount += 1;
      return 'SharedSM';
    },
  });

  const parsingResult = IO.ModelGenerator.parseInstantiationMsg([{
    state_path: '/Behavior State',
    state_class: ':BEHAVIOR',
    initial_state_name: '',
    input_keys: [],
    output_keys: [],
    cond_outcome: [],
    cond_transition: [],
    behavior_class: 'pkg_b__SharedSM',
    parameter_names: [],
    parameter_values: [],
    position: [0, 0],
    outcomes: [],
    transitions: [],
    autonomy: [],
    userdata_keys: [],
    userdata_remapping: [],
  }]);

  assert.strictEqual(pkgACount, 0);
  assert(pkgBCount >= 1);
  WS.Behaviorlib.getBehaviorList();
  assert.strictEqual(global.list, undefined);
  assert.strictEqual(parsingResult.sm_states[0].sm_states[0].state_class, 'SharedSM');

  logs.length = 0;
  const ambiguousResult = IO.ModelGenerator.parseInstantiationMsg([{
    state_path: '/Ambiguous Behavior State',
    state_class: ':BEHAVIOR',
    initial_state_name: '',
    input_keys: [],
    output_keys: [],
    cond_outcome: [],
    cond_transition: [],
    behavior_class: 'SharedSM',
    parameter_names: [],
    parameter_values: [],
    position: [0, 0],
    outcomes: [],
    transitions: [],
    autonomy: [],
    userdata_keys: [],
    userdata_remapping: [],
  }]);

  assert.strictEqual(ambiguousResult.sm_states[0].sm_states.length, 0);
  assertLog(logs, 'error', "Ambiguous behavior class reference 'SharedSM' matches pkg_a::Shared Behavior, pkg_b::Shared Behavior.");
  assert(
    !logs.some(entry => entry.level === 'warn' && entry.message.includes('Unknown behavior reference: SharedSM')),
    `Unexpected fallback warning after ambiguity: ${JSON.stringify(logs)}`
  );
}

async function runLegacyBehaviorImportResolutionCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_codeparser.js');

  const code = `from pkg_b.demo_behavior_sm import SharedSM
from flexbe_core import Behavior
from flexbe_core import OperatableStateMachine


class DemoBehaviorSM(Behavior):
    """
    Define Demo Behavior.

    Created on 2026-03-30
    @author: tester
    """

    def __init__(self, node):
        super().__init__()
        self.name = 'Demo Behavior'

    def create(self):
        _state_machine = OperatableStateMachine(outcomes=['done'])

        with _state_machine:
            OperatableStateMachine.add('Nested Behavior',
                self.use_behavior(SharedSM, 'Nested Behavior'),
                transitions={'done': 'done'},
                autonomy={'done': Autonomy.Off})

        return _state_machine
`;

  const parsingResult = IO.CodeParser.parseCode(code);
  assert.strictEqual(parsingResult.sm_states[0].sm_states[0].state_type, 'behavior');
  assert.strictEqual(parsingResult.sm_states[0].sm_states[0].state_class, 'pkg_b__SharedSM');
}

async function runHelperClassSkippedCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_codeparser.js');

  // File contains a helper Behavior subclass before the real manifest class.
  // Without expected_class_name the parser finds HelperMixinSM first; with it
  // it must target RealBehaviorSM regardless of definition order.
  const code = `from pkg_a.some_state import SomeState
from flexbe_core import Autonomy
from flexbe_core import Behavior
from flexbe_core import OperatableStateMachine


class HelperMixinSM(Behavior):

    def __init__(self, node):
        super().__init__()
        self.name = 'Helper Mixin'

    def create(self):
        _sm = OperatableStateMachine(outcomes=['done'])

        with _sm:
            OperatableStateMachine.add('Step',
                SomeState(),
                transitions={'done': 'done'},
                autonomy={'done': Autonomy.Off})

        return _sm


class RealBehaviorSM(Behavior):
    """
    Define Real Behavior.

    Created on 2026-04-26
    @author: tester
    """

    def __init__(self, node):
        super().__init__()
        self.name = 'Real Behavior'

    def create(self):
        _state_machine = OperatableStateMachine(outcomes=['done'])

        with _state_machine:
            OperatableStateMachine.add('Main Step',
                SomeState(),
                transitions={'done': 'done'},
                autonomy={'done': Autonomy.Off})

        return _state_machine
`;

  // Without the hint the split finds two (Behavior) classes and must throw.
  let threw = false;
  try { IO.CodeParser.parseCode(code); } catch (_) { threw = true; }
  assert(threw, 'Expected parseCode without class hint to throw on ambiguous file');

  // With the expected class name it must parse the correct class.
  const parsingResult = IO.CodeParser.parseCode(code, 'RealBehaviorSM');
  assert.strictEqual(parsingResult.behavior_name, 'Real Behavior');
}

async function runOutcomeCopyCommentEncodingCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_codeparser.js');

  const code = `from pkg_a.some_state import SomeState
from flexbe_core import Autonomy
from flexbe_core import Behavior
from flexbe_core import OperatableStateMachine


class DemoBehaviorSM(Behavior):
    """
    Define Demo Behavior.

    Created on 2026-03-31
    @author: tester
    """

    def __init__(self, node):
        super().__init__()
        self.name = 'Demo Behavior'

    def create(self):
        # task%20done:x:10 y:20, task%20done%231:x:10 y:80
        # route: Alpha%20State>go%20now --> task%20done%231
        _state_machine = OperatableStateMachine(outcomes=['task done'])

        with _state_machine:
            OperatableStateMachine.add('Alpha State',
                SomeState(),
                transitions={'go now': 'task done'},
                autonomy={'go now': Autonomy.Off})
            OperatableStateMachine.add('Beta State',
                SomeState(),
                transitions={'go now': 'task done'},
                autonomy={'go now': Autonomy.Off})

        return _state_machine
`;

  const parsingResult = IO.CodeParser.parseCode(code);
  assert.strictEqual(parsingResult.sm_defs[0].oc_positions[0].name, 'task done');
  assert.strictEqual(parsingResult.sm_defs[0].oc_positions[1].name, 'task done#1');
  assert.strictEqual(parsingResult.sm_defs[0].routes[0].dest_copy, 'task done#1');
  assert.strictEqual(parsingResult.sm_defs[0].routes[0].sources[0].state, 'Alpha State');
  assert.strictEqual(parsingResult.sm_defs[0].routes[0].sources[0].outcome, 'go now');
}

async function runOutcomeCopyBuildRoundTripCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_codeparser.js');

  const code = `from pkg_a.some_state import SomeState
from flexbe_core import Autonomy
from flexbe_core import Behavior
from flexbe_core import OperatableStateMachine


class DemoBehaviorSM(Behavior):
    """
    Define Demo Behavior.

    Created on 2026-03-31
    @author: tester
    """

    def __init__(self, node):
        super().__init__()
        self.name = 'Demo Behavior'

    def create(self):
        # task%20done:x:10 y:20, task%20done%231:x:10 y:80
        # route: Alpha%20State>go%20now --> task%20done%231
        _state_machine = OperatableStateMachine(outcomes=['task done'])

        with _state_machine:
            OperatableStateMachine.add('Alpha State',
                SomeState(),
                transitions={'go now': 'task done'},
                autonomy={'go now': Autonomy.Off})
            OperatableStateMachine.add('Beta State',
                SomeState(),
                transitions={'go now': 'task done'},
                autonomy={'go now': Autonomy.Off})

        return _state_machine
`;

  const parsingResult = IO.CodeParser.parseCode(code);

  function defineBaseStateApi(target, stateName, stateClass, outcomes = [], autonomy = []) {
    let name = stateName;
    let container;
    let position = { x: 0, y: 0 };
    let parameterValues = [];
    let inputMapping = [];
    let outputMapping = [];

    target.getStateName = function() { return name; };
    target.setStateName = function(newName) { name = newName; };
    target.getStateClass = function() { return stateClass; };
    target.getStateType = function() { return stateClass; };
    target.getStatePath = function() {
      return container ? `${container.getStatePath()}/${name}` : `/${name}`;
    };
    target.getParameters = function() { return []; };
    target.getParameterValues = function() { return parameterValues; };
    target.setParameterValues = function(values) { parameterValues = values; };
    target.getAutonomy = function() { return autonomy; };
    target.setAutonomy = function(values) { autonomy = values; };
    target.getInputMapping = function() { return inputMapping; };
    target.setInputMapping = function(values) { inputMapping = values; };
    target.getOutputMapping = function() { return outputMapping; };
    target.setOutputMapping = function(values) { outputMapping = values; };
    target.getPosition = function() { return position; };
    target.setPosition = function(value) { position = value; };
    target.getContainer = function() { return container; };
    target.setContainer = function(value) { container = value; };
    target.getOutcomes = function() { return outcomes; };
    target.getInputKeys = function() { return []; };
    target.getOutputKeys = function() { return []; };
  }

  global.State = function(stateName, definition) {
    const stateClass = definition && definition.state_class ? definition.state_class : 'State';
    const outcomes = definition && definition.outcomes ? definition.outcomes.slice() : [];
    const autonomy = definition && definition.autonomy ? definition.autonomy.slice() : [];
    defineBaseStateApi(this, stateName, stateClass, outcomes, autonomy);
  };

  global.Statemachine = function(stateName, definition) {
    const outcomes = definition ? definition.getOutcomes() : [];
    defineBaseStateApi(this, stateName, ':STATEMACHINE', outcomes.slice(), []);
    const that = this;

    let states = [];
    let transitions = [];
    let initialState;
    let concurrent = false;
    let priority = false;
    let conditions = [];
    let smOutcomes = outcomes.map(function(outcomeName) {
      const outcomeState = new State(outcomeName, { state_class: ':OUTCOME' });
      outcomeState.setContainer(this);
      return outcomeState;
    }, this);

    this.getStates = function() { return states; };
    this.addState = function(state) {
      states.push(state);
      state.setContainer(that);
    };
    this.getStateByName = function(name) {
      return states.find(function(state) { return state.getStateName() === name; });
    };
    this.getTransitions = function() { return transitions; };
    this.addTransition = function(transition) {
      transitions.push(transition);
    };
    this.getInitialState = function() { return initialState; };
    this.setInitialState = function(state) { initialState = state; };
    this.isConcurrent = function() { return concurrent; };
    this.setConcurrent = function(value) { concurrent = value; };
    this.isPriority = function() { return priority; };
    this.setPriority = function(value) { priority = value; };
    this.setConditions = function(value) { conditions = value; };
    this.getConditions = function() { return conditions; };
    this.getSMOutcomes = function() { return smOutcomes; };
    this.getSMOutcomeByName = function(name) {
      return smOutcomes.find(function(state) { return state.getStateName() === name; });
    };
    this.tryDuplicateOutcome = function(baseName) {
      const copies = smOutcomes.filter(function(state) {
        return state.getStateName() === baseName || state.getStateName().startsWith(`${baseName}#`);
      });
      const unused = copies.filter(function(copy) {
        return !transitions.some(function(transition) { return transition.getTo() === copy; });
      });
      if (unused.length === 0) {
        const copy = new State(`${baseName}#${copies.length}`, { state_class: ':OUTCOME' });
        copy.setContainer(that);
        smOutcomes.push(copy);
      }
    };
  };

  global.BehaviorState = function() {};
  global.Transition = function(from, to, outcome, autonomy) {
    let target = to;
    this.getFrom = function() { return from; };
    this.getTo = function() { return target; };
    this.setTo = function(value) { target = value; };
    this.getOutcome = function() { return outcome; };
    this.getAutonomy = function() { return autonomy; };
  };

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    this.getOutcomes = function() { return outcomes; };
    this.getInputKeys = function() { return inputKeys; };
    this.getOutputKeys = function() { return outputKeys; };
  };
  WS.Statelib.getClassFromLib = function(stateClass) {
    if (stateClass === 'SomeState') {
      return {
        state_class: 'SomeState',
        outcomes: ['go now'],
        autonomy: [0],
      };
    }
    return undefined;
  };
  WS.Statelib.isClassUnique = function() {
    return true;
  };
  WS.Statelib.getFromLib = function(stateClass) {
    if (stateClass === ':OUTCOME') {
      return { state_class: ':OUTCOME' };
    }
    return undefined;
  };

  loadScript('flexbe_webui/app/io/io_modelgenerator.js');

  const built = IO.ModelGenerator.buildStateMachine(
    'Root',
    parsingResult.root_sm_name,
    parsingResult.sm_defs,
    parsingResult.sm_states,
    true
  );

  assert.strictEqual(built.getTransitions().length, 2);
  const alphaTransition = built.getTransitions().find(function(transition) {
    return transition.getFrom().getStateName() === 'Alpha State';
  });
  const betaTransition = built.getTransitions().find(function(transition) {
    return transition.getFrom().getStateName() === 'Beta State';
  });
  assert(alphaTransition);
  assert(betaTransition);
  assert.strictEqual(alphaTransition.getOutcome(), 'go now');
  assert.strictEqual(alphaTransition.getTo().getStateName(), 'task done#1');
  assert.strictEqual(betaTransition.getTo().getStateName(), 'task done');
  assert.strictEqual(built.getSMOutcomeByName('task done').getPosition().x, 10);
  assert.strictEqual(built.getSMOutcomeByName('task done#1').getPosition().y, 80);
  assert(built.getSMOutcomeByName('task done#2'));
  assert(
    !logs.some(entry => entry.level === 'warn' && entry.message.includes('Unknown transition target')),
    `unexpected warnings while rebuilding copied outcomes: ${JSON.stringify(logs, null, 2)}`
  );
}

function setupOutcomeCopyEditorHarness() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  function makeShape(initialAttrs = {}) {
    const attrs = Object.assign({}, initialAttrs);
    return {
      attr(arg) {
        if (typeof arg === 'string') {
          return attrs[arg];
        }
        Object.assign(attrs, arg);
        return this;
      },
      data() { return this; },
      mousemove() { return this; },
      drag() { return this; },
      click() { return this; },
      toBack() { return this; },
      toFront() { return this; },
      translate() { return this; },
      transform() { return ''; },
      hide() { return this; },
      show() { return this; },
      remove() {},
    };
  }

  global.Raphael = function() {
    return {
      width: 400,
      height: 300,
      rect() {
        return makeShape({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
      },
      circle() {
        return makeShape({ cx: 0, cy: 0, opacity: 0 });
      },
      path() {
        return makeShape();
      },
      remove() {},
    };
  };

  loadScript('flexbe_webui/app/ui/ui_statemachine.js');
  UI.Statemachine.initialize();
  UI.Statemachine.removeSelection = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.isPageStatemachine = function() { return false; };
  T.debugWarn = function() {};

  function makeStateDefinition(stateClass, outcomes = [], autonomy = []) {
    return {
      getStateClass() { return stateClass; },
      getStatePath() { return `demo_pkg/${stateClass.toLowerCase()}`; },
      getStatePackage() { return 'demo_pkg'; },
      getParameters() { return []; },
      getDefaultParameterValues() { return []; },
      getOutcomes() { return outcomes.slice(); },
      getDefaultAutonomy() { return autonomy.slice(); },
      getInputKeys() { return []; },
      getOutputKeys() { return []; },
    };
  }

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    let smOutcomes = outcomes.slice();
    this.getStateClass = function() { return ':STATEMACHINE'; };
    this.getStatePath = function() { return 'demo_pkg/statemachine'; };
    this.getStatePackage = function() { return 'demo_pkg'; };
    this.getParameters = function() { return []; };
    this.getDefaultParameterValues = function() { return []; };
    this.getOutcomes = function() { return smOutcomes.slice(); };
    this.getDefaultAutonomy = function() { return smOutcomes.map(function() { return -1; }); };
    this.getInputKeys = function() { return inputKeys.slice(); };
    this.getOutputKeys = function() { return outputKeys.slice(); };
    this.addOutcome = function(outcome) { smOutcomes.push(outcome); };
    this.insertOutcome = function(outcome, index) { smOutcomes.splice(index, 0, outcome); };
    this.removeOutcome = function(outcome) {
      smOutcomes = smOutcomes.filter(function(entry) { return entry !== outcome; });
    };
  };

  WS.Statelib.getFromLib = function(stateClass) {
    if (stateClass === ':INIT') {
      return makeStateDefinition(':INIT');
    }
    if (stateClass === ':OUTCOME') {
      return makeStateDefinition(':OUTCOME');
    }
    if (stateClass === ':CONDITION') {
      return makeStateDefinition(':CONDITION');
    }
    if (stateClass === 'WorkerState') {
      return makeStateDefinition('WorkerState', ['done'], [0]);
    }
    return makeStateDefinition(stateClass);
  };
  global.BehaviorState = function() {};

  loadScript('flexbe_webui/app/_model/transition.js');
  loadScript('flexbe_webui/app/_model/state.js');
  loadScript('flexbe_webui/app/_model/statemachine.js');

  const activities = [];
  ActivityTracer.ACT_TRANSITION = 'transition';
  ActivityTracer.addActivity = function(type, description, undo, redo) {
    activities.push({ type, description, undo, redo });
  };

  const sm = new Statemachine('Root', new WS.StateMachineDefinition(['done'], [], []));
  sm.getStatePath = function() {
    return '';
  };
  Behavior.getStatemachine = function() {
    return sm;
  };
  UI.Statemachine.setDisplayedSM(sm);

  return { activities, sm };
}

function buildOutcomeCopyTransitionFixture() {
  const { activities, sm } = setupOutcomeCopyEditorHarness();

  const alpha = new State('Alpha', WS.Statelib.getFromLib('WorkerState'));
  const beta = new State('Beta', WS.Statelib.getFromLib('WorkerState'));
  sm.addState(alpha);
  sm.addState(beta);

  const baseOutcome = sm.getSMOutcomeByName('done');
  const alphaTransition = new Transition(alpha, baseOutcome, 'done', 0);
  sm.addTransition(alphaTransition);
  sm.tryDuplicateOutcome('done');

  const copiedOutcome = sm.getSMOutcomeByName('done#1');
  const betaTransition = new Transition(beta, copiedOutcome, 'done', 0);
  sm.addTransition(betaTransition);
  sm.tryDuplicateOutcome('done');

  return {
    activities,
    sm,
    baseOutcome,
    copiedOutcome,
    betaTransition,
  };
}

async function runOutcomeCopyReconnectUndoCase() {
  const fixture = buildOutcomeCopyTransitionFixture();

  assert(fixture.sm.getSMOutcomeByName('done#2'));

  UI.Statemachine.resetTransition(fixture.betaTransition);
  UI.Statemachine.connectTransition(fixture.baseOutcome);

  assert.strictEqual(fixture.betaTransition.getTo().getStateName(), 'done');
  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#2'), undefined);
  assert.strictEqual(fixture.activities.length, 1);
  fixture.activities[0].undo();

  const undone = fixture.sm.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  assert(undone);
  assert.strictEqual(undone.getTo().getStateName(), 'done#1');
  assert(fixture.sm.getSMOutcomeByName('done#2'));

  fixture.activities[0].redo();

  const redone = fixture.sm.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  assert(redone);
  assert.strictEqual(redone.getTo().getStateName(), 'done');
  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#2'), undefined);
}

async function runOutcomeCopyRemoveUndoCase() {
  const fixture = buildOutcomeCopyTransitionFixture();

  UI.Statemachine.resetTransition(fixture.betaTransition);
  UI.Statemachine.removeTransition();

  assert.strictEqual(fixture.sm.getTransitions().length, 2);
  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#2'), undefined);
  assert.strictEqual(fixture.activities.length, 1);

  fixture.activities[0].undo();

  const restored = fixture.sm.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  assert(restored);
  assert.strictEqual(restored.getTo().getStateName(), 'done#1');
  assert(fixture.sm.getSMOutcomeByName('done#2'));

  fixture.activities[0].redo();

  const removedAgain = fixture.sm.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  assert.strictEqual(removedAgain, undefined);
  assert.strictEqual(fixture.sm.getTransitions().length, 2);
  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#2'), undefined);
}

async function runOutcomeCopySingleSpareCase() {
  const fixture = buildOutcomeCopyTransitionFixture();
  const gamma = new State('Gamma', WS.Statelib.getFromLib('WorkerState'));
  const delta = new State('Delta', WS.Statelib.getFromLib('WorkerState'));
  fixture.sm.addState(gamma);
  fixture.sm.addState(delta);

  fixture.sm.retargetTransition(fixture.betaTransition, fixture.sm.getSMOutcomeByName('done#2'));

  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert(fixture.sm.getSMOutcomeByName('done#2'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#3'), undefined);

  const gammaTransition = new Transition(gamma, fixture.sm.getSMOutcomeByName('done#1'), 'done', 0);
  fixture.sm.addTransition(gammaTransition);

  assert(fixture.sm.getSMOutcomeByName('done#3'));

  fixture.sm.removeTransitionObject(gammaTransition);

  assert(fixture.sm.getSMOutcomeByName('done#1'));
  assert(fixture.sm.getSMOutcomeByName('done#2'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#3'), undefined);

  const alphaTransition = fixture.sm.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Alpha' && transition.getOutcome() === 'done';
  });
  fixture.sm.removeTransitionObject(alphaTransition);

  assert(fixture.sm.getSMOutcomeByName('done'));
  assert.strictEqual(fixture.sm.getSMOutcomeByName('done#1'), undefined);
  assert(fixture.sm.getSMOutcomeByName('done#2'));

  const deltaTransition = new Transition(delta, fixture.sm.getSMOutcomeByName('done'), 'done', 0);
  fixture.sm.addTransition(deltaTransition);

  assert(fixture.sm.getSMOutcomeByName('done#2'));
  assert(fixture.sm.getSMOutcomeByName('done#3'));
}

async function runOutcomeCopyVisiblePlacementCase() {
  const fixture = buildOutcomeCopyTransitionFixture();
  const viewport = { left: 200, top: 100, right: 600, bottom: 400 };

  UI.Statemachine.getPanShift = function() {
    return { x: -viewport.left, y: -viewport.top };
  };
  UI.Statemachine.getR = function() {
    return {
      width: viewport.right - viewport.left,
      height: viewport.bottom - viewport.top,
    };
  };

  fixture.sm.getSMOutcomeByName('done').setPosition({ x: 760, y: 120 });
  fixture.sm.getSMOutcomeByName('done#1').setPosition({ x: 760, y: 220 });
  fixture.sm.getSMOutcomeByName('done#2').setPosition({ x: 760, y: 320 });

  [
    { name: 'BlockTop', position: { x: 430, y: 110 } },
    { name: 'BlockMid', position: { x: 430, y: 210 } },
    { name: 'BlockBottom', position: { x: 430, y: 300 } },
  ].forEach(function(blocker) {
    const state = new State(blocker.name, WS.Statelib.getFromLib('WorkerState'));
    state.setPosition(blocker.position);
    fixture.sm.addState(state);
  });

  const gamma = new State('Gamma', WS.Statelib.getFromLib('WorkerState'));
  gamma.setPosition({ x: 520, y: 230 });
  fixture.sm.addState(gamma);

  fixture.sm.addTransition(new Transition(gamma, fixture.sm.getSMOutcomeByName('done#2'), 'done', 0));

  const spare = fixture.sm.getSMOutcomeByName('done#3');
  assert(spare);
  assert(spare.getPosition().x >= viewport.left);
  assert(spare.getPosition().x <= viewport.right - 50);
  assert(spare.getPosition().y >= viewport.top);
  assert(spare.getPosition().y <= viewport.bottom - 30);
  assert(spare.getPosition().x < 360);
}

function buildOutcomeCopyContainerOutcomeFixture() {
  const { activities, sm: root } = setupOutcomeCopyEditorHarness();
  root.getStateName = function() { return ''; };

  loadScript('flexbe_webui/app/ui/panels/ui_panels_stateproperties.js');

  UI.Panels.STATE_PROPERTIES_PANEL = 'state_properties';
  UI.Panels.setActivePanel = function() {};
  UI.Panels.hidePanelIfActive = function() {};
  UI.Panels.updatePanelTabTargets = function() {};
  UI.Panels.setFocus = function() {};

  ActivityTracer.ACT_STATE_CHANGE = 'state_change';
  ActivityTracer.addActivity = function(type, description, undo, redo) {
    activities.push({ type, description, undo, redo });
  };

  RC.Controller.isReadonly = function() { return false; };
  RC.Controller.isLocked = function() { return false; };
  RC.Controller.isStateLocked = function() { return false; };
  RC.Controller.isOnLockedPath = function() { return false; };
  Behavior.isReadonly = function() { return false; };

  const nested = new Statemachine('Nested', new WS.StateMachineDefinition(['done'], [], []));
  root.addState(nested);

  const alpha = new State('Alpha', WS.Statelib.getFromLib('WorkerState'));
  const beta = new State('Beta', WS.Statelib.getFromLib('WorkerState'));
  nested.addState(alpha);
  nested.addState(beta);

  const baseOutcome = nested.getSMOutcomeByName('done');
  baseOutcome.setPosition({ x: 320, y: 80 });
  nested.addTransition(new Transition(alpha, baseOutcome, 'done', 0));
  nested.tryDuplicateOutcome('done');

  const copiedOutcome = nested.getSMOutcomeByName('done#1');
  copiedOutcome.setPosition({ x: 320, y: 180 });
  nested.addTransition(new Transition(beta, copiedOutcome, 'done', 0));
  nested.tryDuplicateOutcome('done');

  const spareOutcome = nested.getSMOutcomeByName('done#2');
  spareOutcome.setPosition({ x: 320, y: 280 });

  root.addTransition(new Transition(nested, root.getSMOutcomeByName('done'), 'done', -1));

  Behavior.getStatemachine = function() {
    return root;
  };
  UI.Statemachine.setDisplayedSM(nested);

  return {
    activities,
    root,
    nested,
    baseOutcome,
    copiedOutcome,
    spareOutcome,
  };
}

async function runOutcomeCopyContainerOutcomeUndoCase() {
  const fixture = buildOutcomeCopyContainerOutcomeFixture();
  const countNonInitTransitions = function(container) {
    return container.getTransitions().filter(function(transition) {
      return transition.getFrom().getStateName() !== 'INIT';
    }).length;
  };

  assert.strictEqual(fixture.root.getTransitions().length, 2);
  assert.strictEqual(countNonInitTransitions(fixture.root), 1);

  UI.Panels.StateProperties.displayStateProperties(fixture.nested);
  const removeButton = document.getElementById('panel_prop_sm_outcomes_content_0_remove');
  removeButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(fixture.activities.length, 1);
  assert.deepStrictEqual(fixture.nested.getOutcomes(), []);
  assert.strictEqual(fixture.nested.getTransitions().length, 1);
  assert.strictEqual(fixture.root.getTransitions().length, 1);
  assert.strictEqual(countNonInitTransitions(fixture.root), 0);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done'), undefined);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#1'), undefined);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#2'), undefined);

  fixture.activities[0].undo();

  const restoredAlpha = fixture.nested.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Alpha' && transition.getOutcome() === 'done';
  });
  const restoredBeta = fixture.nested.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Beta' && transition.getOutcome() === 'done';
  });
  const restoredParent = fixture.root.getTransitions().findElement(function(transition) {
    return transition.getFrom().getStateName() === 'Nested' && transition.getOutcome() === 'done';
  });
  assert(restoredAlpha);
  assert.strictEqual(restoredAlpha.getTo().getStateName(), 'done');
  assert(restoredBeta);
  assert.strictEqual(restoredBeta.getTo().getStateName(), 'done#1');
  assert(restoredParent);
  assert.strictEqual(restoredParent.getTo().getStateName(), 'done');
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#1').getPosition().y, 180);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#2').getPosition().y, 280);
  assert.deepStrictEqual(fixture.nested.getOutcomes(), ['done']);
  assert.strictEqual(fixture.nested.getTransitions().length, 3);
  assert.strictEqual(fixture.root.getTransitions().length, 2);
  assert.strictEqual(countNonInitTransitions(fixture.root), 1);

  fixture.activities[0].redo();

  assert.deepStrictEqual(fixture.nested.getOutcomes(), []);
  assert.strictEqual(fixture.nested.getTransitions().length, 1);
  assert.strictEqual(fixture.root.getTransitions().length, 1);
  assert.strictEqual(countNonInitTransitions(fixture.root), 0);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#1'), undefined);
  assert.strictEqual(fixture.nested.getSMOutcomeByName('done#2'), undefined);
}

function setupToolsOutcomeCopyHarness() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  function defineBaseStateApi(target, stateName, stateClass, outcomes = [], autonomy = []) {
    let name = stateName;
    let container;
    let position = { x: 0, y: 0 };
    let parameterValues = [];
    let inputMapping = [];
    let outputMapping = [];

    target.getStateName = function() { return name; };
    target.setStateName = function(newName) { name = newName; };
    target.getStateClass = function() { return stateClass; };
    target.getStateType = function() { return stateClass; };
    target.getStatePath = function() {
      return container ? `${container.getStatePath()}/${name}` : `/${name}`;
    };
    target.getParameterValues = function() { return parameterValues; };
    target.setParameterValues = function(values) { parameterValues = values; };
    target.getAutonomy = function() { return autonomy; };
    target.setAutonomy = function(values) { autonomy = values; };
    target.getInputMapping = function() { return inputMapping; };
    target.setInputMapping = function(values) { inputMapping = values; };
    target.getOutputMapping = function() { return outputMapping; };
    target.setOutputMapping = function(values) { outputMapping = values; };
    target.getPosition = function() { return position; };
    target.setPosition = function(value) { position = value; };
    target.getContainer = function() { return container; };
    target.setContainer = function(value) { container = value; };
    target.getOutcomes = function() { return outcomes; };
  }

  global.State = function(stateName, definition) {
    const stateClass = definition && definition.state_class ? definition.state_class : 'State';
    const outcomes = definition && definition.outcomes ? definition.outcomes.slice() : [];
    const autonomy = definition && definition.autonomy ? definition.autonomy.slice() : [];
    defineBaseStateApi(this, stateName, stateClass, outcomes, autonomy);
  };

  global.Statemachine = function(stateName, definition) {
    const outcomes = definition ? definition.getOutcomes() : [];
    defineBaseStateApi(this, stateName, ':STATEMACHINE', outcomes.slice(), []);
    const that = this;

    let states = [];
    let transitions = [];
    let initialState;
    let concurrent = false;
    let priority = false;
    let smOutcomes = outcomes.map(function(outcomeName) {
      const outcomeState = new State(outcomeName, { state_class: ':OUTCOME' });
      outcomeState.setContainer(this);
      return outcomeState;
    }, this);

    this.getStates = function() { return states; };
    this.addState = function(state) {
      states.push(state);
      state.setContainer(that);
    };
    this.getStateByName = function(name) {
      return states.find(function(state) { return state.getStateName() === name; });
    };
    this.getStateByPath = function(path) {
      if (path === '' || path === '/') {
        return that;
      }
      const parts = path.split('/').filter(Boolean);
      let current = that;
      for (const part of parts) {
        if (current.getStateName && current.getStateName() === part) {
          continue;
        }
        if (!current.getStateByName) {
          return undefined;
        }
        current = current.getStateByName(part);
        if (current === undefined) {
          return undefined;
        }
      }
      return current;
    };
    this.getTransitions = function() { return transitions; };
    this.addTransition = function(transition) {
      transitions.push(transition);
    };
    this.removeState = function(state) {
      states = states.filter(function(entry) { return entry !== state; });
      state.setContainer(undefined);
    };
    this.getInitialState = function() { return initialState; };
    this.setInitialState = function(state) { initialState = state; };
    this.isConcurrent = function() { return concurrent; };
    this.setConcurrent = function(value) { concurrent = value; };
    this.isPriority = function() { return priority; };
    this.setPriority = function(value) { priority = value; };
    this.getSMOutcomes = function() { return smOutcomes; };
    this.getSMOutcomeByName = function(name) {
      return smOutcomes.find(function(state) { return state.getStateName() === name; });
    };
    this.getInputKeys = function() { return []; };
    this.getOutputKeys = function() { return []; };
    this.tryDuplicateOutcome = function(baseName) {
      const copies = smOutcomes.filter(function(state) {
        return state.getStateName() === baseName || state.getStateName().startsWith(`${baseName}#`);
      });
      const unused = copies.filter(function(copy) {
        return !transitions.some(function(transition) { return transition.getTo() === copy; });
      });
      if (unused.length === 0) {
        const copy = new State(`${baseName}#${copies.length}`, { state_class: ':OUTCOME' });
        copy.setContainer(that);
        smOutcomes.push(copy);
      }
    };
  };

  global.BehaviorState = function() {};
  global.Transition = function(from, to, outcome, autonomy) {
    let fromState = from;
    let toState = to;
    this.getFrom = function() { return from; };
    this.setFrom = function(value) { fromState = value; };
    this.getFrom = function() { return fromState; };
    this.getTo = function() { return toState; };
    this.setTo = function(value) { toState = value; };
    this.getOutcome = function() { return outcome; };
    this.getAutonomy = function() { return autonomy; };
  };

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    this.getOutcomes = function() { return outcomes; };
    this.getInputKeys = function() { return inputKeys; };
    this.getOutputKeys = function() { return outputKeys; };
  };
  WS.Statelib.getFromLib = function(stateClass) {
    if (stateClass === ':OUTCOME') {
      return { state_class: ':OUTCOME' };
    }
    return {
      state_class: 'WorkerState',
      outcomes: ['done'],
      autonomy: [0],
    };
  };

  const activities = [];
  ActivityTracer.ACT_COMPLEX_OPERATION = 'complex';
  ActivityTracer.addActivity = function(type, description, undo, redo) {
    activities.push({ type, description, undo, redo });
  };
  UI.Panels.StateProperties = {
    isCurrentState() { return false; },
    hide() {},
  };
  RC.Controller.isRunning = function() { return false; };
  RC.Controller.isOnLockedPath = function() { return false; };

  let selectedElements = [];
  let displayedSm;
  UI.Statemachine.getSelectedStatesAndTransitions = function() {
    return selectedElements;
  };
  UI.Statemachine.removeSelection = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Statemachine.getDisplayedSM = function() {
    return displayedSm;
  };

  loadScript('flexbe_webui/app/_helper/tools.js');

  const targetContainer = new Statemachine('Root', new WS.StateMachineDefinition([], [], []));
  targetContainer.getStatePath = function() {
    return '';
  };
  Behavior.getStatemachine = function() {
    return targetContainer;
  };
  displayedSm = targetContainer;

  function createNestedGroup() {
    const sourceSm = new Statemachine('Nested Group', new WS.StateMachineDefinition(['done'], [], []));
    const childState = new State('Worker', WS.Statelib.getFromLib('WorkerState'));
    childState.setPosition({ x: 20, y: 30 });
    sourceSm.addState(childState);

    const copiedOutcome = new State('done#1', { state_class: ':OUTCOME' });
    copiedOutcome.setPosition({ x: 111, y: 222 });
    copiedOutcome.setContainer(sourceSm);
    sourceSm.getSMOutcomes().push(copiedOutcome);
    sourceSm.addTransition(new Transition(childState, copiedOutcome, 'done', 0));
    return sourceSm;
  }

  return {
    activities,
    targetContainer,
    createNestedGroup,
    setSelectedElements(elements) {
      selectedElements = elements;
    },
    setDisplayedSm(sm) {
      displayedSm = sm;
    },
  };
}

async function runToolsOutcomeCopyPasteCase() {
  const harness = setupToolsOutcomeCopyHarness();
  const sourceSm = harness.createNestedGroup();
  harness.setSelectedElements([sourceSm]);

  Tools.copy();
  Tools.paste();

  const pastedSm = harness.targetContainer.getStateByName('Nested Group');
  assert(pastedSm);
  assert.strictEqual(pastedSm.getTransitions().length, 1);
  assert.strictEqual(pastedSm.getTransitions()[0].getTo().getStateName(), 'done#1');
  assert.strictEqual(pastedSm.getSMOutcomeByName('done#1').getPosition().x, 111);
  assert.strictEqual(pastedSm.getSMOutcomeByName('done#1').getPosition().y, 222);
}

async function runToolsOutcomeCopyPasteHistoryCase() {
  const harness = setupToolsOutcomeCopyHarness();
  const sourceSm = harness.createNestedGroup();
  harness.setSelectedElements([sourceSm]);

  Tools.copy();
  Tools.paste();

  assert.strictEqual(harness.activities.length, 1);
  let pastedSm = harness.targetContainer.getStateByName('Nested Group');
  assert(pastedSm);
  assert.strictEqual(pastedSm.getTransitions()[0].getTo().getStateName(), 'done#1');

  harness.activities[0].undo();
  assert.strictEqual(harness.targetContainer.getStateByName('Nested Group'), undefined);

  harness.activities[0].redo();
  pastedSm = harness.targetContainer.getStateByName('Nested Group');
  assert(pastedSm);
  assert.strictEqual(pastedSm.getTransitions().length, 1);
  assert.strictEqual(pastedSm.getTransitions()[0].getTo().getStateName(), 'done#1');
  assert.strictEqual(pastedSm.getSMOutcomeByName('done#1').getPosition().x, 111);
}

async function runToolsOutcomeCopyCutHistoryCase() {
  const harness = setupToolsOutcomeCopyHarness();
  const sourceSm = harness.createNestedGroup();
  harness.targetContainer.addState(sourceSm);
  harness.setSelectedElements([sourceSm]);

  Tools.cut();

  assert.strictEqual(harness.activities.length, 1);
  assert.strictEqual(harness.targetContainer.getStateByName('Nested Group'), undefined);

  harness.activities[0].undo();

  let restoredSm = harness.targetContainer.getStateByName('Nested Group');
  assert(restoredSm);
  assert.strictEqual(restoredSm.getTransitions().length, 1);
  assert.strictEqual(restoredSm.getTransitions()[0].getTo().getStateName(), 'done#1');
  assert.strictEqual(restoredSm.getSMOutcomeByName('done#1').getPosition().y, 222);

  harness.activities[0].redo();
  assert.strictEqual(harness.targetContainer.getStateByName('Nested Group'), undefined);
}

async function runBehaviorLoaderFailureCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  Behavior.resetBehavior = function() {};
  UI.Dashboard.resetAllFields = function() {};
  UI.Statemachine.resetStatemachine = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.toDashboardClicked = function() {};
  UI.Panels.NO_PANEL = 'none';
  UI.Panels.setActivePanel = function() {};

  global.IO.CodeParser = {
    parseCode() {
      throw new Error('parse failed');
    },
  };
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  const parseResult = await new Promise(resolve => {
    IO.BehaviorLoader.parseBehaviorSM({ name: 'Broken', codefile_content: 'broken' }, resolve);
  });
  assert.strictEqual(parseResult, undefined);

  IO.CodeParser.parseCode = function() {
    return {
      behavior_name: 'ParentBehavior',
      sm_defs: [],
      sm_states: [],
      root_sm_name: 'root',
      default_userdata: [],
      state_types: {},
    };
  };
  global.IO.ModelGenerator = {
    generateBehaviorAttributes() {},
    buildStateMachine() {
      return {};
    },
  };
  Behavior.setStatemachine = function() {};
  Behavior.setReadonly = function() {};
  ActivityTracer.resetActivities = function() {};
  global.Checking = {
    checkBehavior() { return undefined; },
  };
  RC.Controller.signalChanged = function() {};

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      assert.strictEqual(pkg, 'child_pkg');
      assert.strictEqual(name, 'ChildBehavior');
      return {
        ensureBSMReady(callback) {
          callback(false);
        },
        getStatePackage() { return 'child_pkg'; },
        getBehaviorName() { return 'ChildBehavior'; },
        getBehaviorManifest() { return { contains: [] }; },
      };
    },
    getByName() { return undefined; },
  };

  const loadError = await new Promise(resolve => {
    IO.BehaviorLoader.loadBehavior({
      name: 'ParentBehavior',
      manifest_path: '/tmp/parent.xml',
      codefile_path: '/tmp/parent.py',
      codefile_name: 'parent_behavior_sm.py',
      codefile_content: 'root code',
      contains: [{ name: 'ChildBehavior', package: 'child_pkg' }],
    }, resolve);
  });

  assert.strictEqual(loadError, 'Failed to prepare sub-behavior state machines (child_pkg::ChildBehavior)');
}

async function runBehaviorLoaderOptionalCallbackCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  const apiPosts = [];
  API.post = function(action, content, callback) {
    apiPosts.push({ action, content });
    if (callback) callback({ success: true, data: null });
  };

  Behavior.resetBehavior = function() {};
  UI.Dashboard.resetAllFields = function() {};
  UI.Statemachine.resetStatemachine = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.toDashboardClicked = function() {};
  UI.Panels.NO_PANEL = 'none';
  UI.Panels.setActivePanel = function() {};

  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  IO.BehaviorLoader.ensureFullContent = function(_manifest, callback) {
    callback(undefined);
  };

  assert.doesNotThrow(function() {
    IO.BehaviorLoader.loadBehavior({
      name: 'Broken',
      manifest_path: '/tmp/broken.xml',
      codefile_path: '/tmp/broken.py',
      codefile_name: 'broken_behavior_sm.py',
      rosnode_name: 'demo_pkg',
    });
  });

  assertLog(logs, 'error', "Failed to load behavior source for 'Broken'");
  assert.deepStrictEqual(apiPosts, [{ action: 'session/loaded_behavior', content: null }]);
}

async function runBehaviorLoaderSessionRecordCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let clearLogCalls = 0;
  let terminalShowCalls = 0;
  T.clearLog = function() { clearLogCalls += 1; };
  UI.Panels.Terminal.show = function() { terminalShowCalls += 1; };

  const apiPosts = [];
  API.post = function(action, content, callback) {
    apiPosts.push({ action, content });
    if (callback) callback({ success: true, data: null });
  };
  const apiGets = [];
  const fullBehaviorData = {
    rosnode_name: 'my_pkg',
    name: 'MyBehavior',
    manifest_path: '/tmp/my_behavior.xml',
    codefile_relpath: 'my_behavior_sm.py',
    codefile_name: 'my_behavior_sm.py',
    codefile_content: 'root code',
    description: 'Restored manifest description',
    tags: 'restore,test',
    author: 'Test Author',
    date: '2026-05-07',
    params: [],
    contains: [],
  };
  API.getData = function(action, callback) {
    apiGets.push(action);
    assert.strictEqual(action, 'io/behavior/my_pkg/my_behavior_sm.py');
    callback(fullBehaviorData);
  };

  Behavior.resetBehavior = function() {};
  UI.Dashboard.resetAllFields = function() {};
  UI.Statemachine.resetStatemachine = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.toDashboardClicked = function() {};
  UI.Panels.NO_PANEL = 'none';
  UI.Panels.setActivePanel = function() {};

  global.IO.CodeParser = {
    parseCode() {
      return { behavior_name: 'MyBehavior', sm_defs: [], sm_states: [], root_sm_name: 'root', default_userdata: [], state_types: {} };
    },
  };
  WS.Behaviorlib.getByKey = function(pkg, name) {
    assert.strictEqual(pkg, 'my_pkg');
    assert.strictEqual(name, 'MyBehavior');
    return undefined;
  };
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  let generatedManifest;
  global.IO.ModelGenerator = {
    generateBehaviorAttributes(_data, manifest) { generatedManifest = manifest; },
    buildStateMachine() { return {}; },
  };
  Behavior.setStatemachine = function() {};
  Behavior.setReadonly = function() {};
  ActivityTracer.resetActivities = function() {};
  global.Checking = { checkBehavior() { return undefined; } };
  RC.Controller.signalChanged = function() {};

  const loadError = await new Promise(resolve => {
    IO.BehaviorLoader.loadBehavior({
      rosnode_name: 'my_pkg',
      name: 'MyBehavior',
      manifest_path: '/tmp/my_behavior.xml',
      codefile_relpath: 'my_behavior_sm.py',
      codefile_name: 'my_behavior_sm.py',
      editable: true,
    }, resolve);
  });

  assert.strictEqual(loadError, undefined, 'Expected successful load');
  assert.deepStrictEqual(apiGets, ['io/behavior/my_pkg/my_behavior_sm.py']);
  assert.strictEqual(generatedManifest.description, 'Restored manifest description');
  assert.strictEqual(generatedManifest.tags, 'restore,test');
  assert.strictEqual(generatedManifest.author, 'Test Author');
  assert.strictEqual(generatedManifest.date, '2026-05-07');
  assert.strictEqual(clearLogCalls, 1, 'Expected manual/default behavior load to clear terminal log');
  assert.strictEqual(terminalShowCalls, 1, 'Expected manual/default behavior load to show terminal');
  assert.strictEqual(apiPosts.length, 2, 'Expected session clear on start and session record on success');
  assert.deepStrictEqual(apiPosts[0], { action: 'session/loaded_behavior', content: null });
  assert.deepStrictEqual(apiPosts[1], {
    action: 'session/loaded_behavior',
    content: {
      package: 'my_pkg',
      behavior_name: 'MyBehavior',
      manifest_path: '/tmp/my_behavior.xml',
      codefile_name: 'my_behavior_sm.py',
      editable: true,
    },
  });
}

async function runBehaviorLoaderRestoreFailureKeepsSessionCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  let clearLogCalls = 0;
  let terminalShowCalls = 0;
  T.clearLog = function() { clearLogCalls += 1; };
  UI.Panels.Terminal.show = function() { terminalShowCalls += 1; };

  const apiPosts = [];
  API.post = function(action, content, callback) {
    apiPosts.push({ action, content });
    if (callback) callback({ success: true, data: null });
  };

  Behavior.resetBehavior = function() {};
  UI.Dashboard.resetAllFields = function() {};
  UI.Statemachine.resetStatemachine = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.toDashboardClicked = function() {};
  UI.Panels.NO_PANEL = 'none';
  UI.Panels.setActivePanel = function() {};

  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  IO.BehaviorLoader.ensureFullContent = function(_manifest, callback) {
    callback(undefined);
  };

  const loadError = await new Promise(resolve => {
    IO.BehaviorLoader.loadBehavior({
      name: 'BrokenRestore',
      manifest_path: '/tmp/broken_restore.xml',
      codefile_path: '/tmp/broken_restore.py',
      codefile_name: 'broken_restore_sm.py',
      rosnode_name: 'demo_pkg',
    }, resolve, { clear_session: false, clear_terminal: false });
  });

  assert.strictEqual(loadError, 'Failed to load behavior source');
  assert.strictEqual(clearLogCalls, 0, 'Expected session restore load to preserve terminal log');
  assert.strictEqual(terminalShowCalls, 0, 'Expected session restore load to avoid forcing terminal open');
  assert.deepStrictEqual(apiPosts, []);
}

async function runBehaviorLoaderBrowserDeferredCallbacksCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const originalProcess = global.process;
  global.process = undefined;
  try {
    Behavior.createNames = function() {
      return {
        rosnode_name: 'demo_pkg',
        file_name: 'broken_behavior_sm.py',
      };
    };
    global.ROS = {
      getPackagePythonPath(_packageName, callback) {
        callback(undefined);
      },
    };
    global.IO.CodeParser = {
      parseSMInterface() {
        throw new Error('interface parse failed');
      },
      parseCode() {
        throw new Error('state machine parse failed');
      },
    };

    loadScript('flexbe_webui/app/io/io_behaviorloader.js');

    let interfaceResult = 'pending';
    let manualSectionsUpdated = false;
    let parsedSm = 'pending';

    IO.BehaviorLoader.loadBehaviorInterface({
      name: 'Broken',
      codefile_content: 'broken code',
    }, function(result) {
      interfaceResult = result;
    });
    IO.BehaviorLoader.updateManualSections(function() {
      manualSectionsUpdated = true;
    });
    IO.BehaviorLoader.parseBehaviorSM({
      name: 'Broken',
      codefile_content: 'broken code',
    }, function(result) {
      parsedSm = result;
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(interfaceResult, undefined);
    assert.strictEqual(manualSectionsUpdated, true);
    assert.strictEqual(parsedSm, undefined);
    assertLog(logs, 'error', 'Failed to parse behavior interface of Broken: Error: interface parse failed');
  } finally {
    global.process = originalProcess;
  }
}

async function runBehaviorLoaderLegacyPackageDefaultCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  let getByNameCalls = 0;
  let updateEntryArg = undefined;
  const samePkgEntry = {
    ensureBSMReady(callback) {
      callback(true);
    },
    getStatePackage() { return 'parent_pkg'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getBehaviorManifest() { return { rosnode_name: 'parent_pkg', contains: [] }; },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'parent_pkg' && name === 'ChildBehavior') {
        return samePkgEntry;
      }
      return undefined;
    },
    getByName() {
      getByNameCalls += 1;
      return undefined;
    },
    updateEntry(entry) {
      updateEntryArg = entry;
    },
  };

  const readyResult = await new Promise(resolve => {
    IO.BehaviorLoader.ensureSubbehaviorsReady({
      rosnode_name: 'parent_pkg',
      contains: [{ name: 'ChildBehavior' }],
    }, function(success, failedKey) {
      resolve({ success, failedKey });
    });
  });

  assert.deepStrictEqual(readyResult, { success: true, failedKey: undefined });
  assert.strictEqual(getByNameCalls, 0);
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'ChildBehavior' has no package in manifest; defaulting lookup to same package 'parent_pkg'.");

  const ignoreList = IO.BehaviorLoader.loadBehaviorDependencies({
    rosnode_name: 'parent_pkg',
    contains: [{ name: 'ChildBehavior' }],
  }, []);

  assert.deepStrictEqual(ignoreList, ['parent_pkg::ChildBehavior']);
  assert.strictEqual(updateEntryArg, samePkgEntry);
  assert.strictEqual(getByNameCalls, 0);
  assertLog(logs, 'warn', "loadBehaviorDependencies: sub-behavior 'ChildBehavior' has no package in manifest; defaulting lookup to same package 'parent_pkg'.");
}

async function runBehaviorLoaderLegacyPythonHintCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  Behavior.resetBehavior = function() {};
  Behavior.setStatemachine = function() {};
  Behavior.setReadonly = function() {};
  UI.Dashboard.resetAllFields = function() {};
  UI.Statemachine.resetStatemachine = function() {};
  UI.Statemachine.refreshView = function() {};
  UI.Menu.toDashboardClicked = function() {};
  UI.Panels.NO_PANEL = 'none';
  UI.Panels.setActivePanel = function() {};
  ActivityTracer.resetActivities = function() {};
  RC.Controller.signalChanged = function() {};
  global.Checking = {
    checkBehavior() { return undefined; },
  };
  global.IO.CodeParser = {
    parseCode() {
      return {
        behavior_name: 'ParentBehavior',
        state_types: { ChildBehaviorSM: 'hint_pkg' },
        sm_defs: [],
        sm_states: [{
          sm_name: 'root',
          sm_states: [{
            state_type: 'behavior',
            state_class: 'ChildBehaviorSM',
          }],
        }],
        root_sm_name: 'root',
        default_userdata: [],
      };
    },
  };
  global.IO.ModelGenerator = {
    generateBehaviorAttributes() {},
    buildStateMachine() {
      return {};
    },
  };
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  let ensureReadyCalls = 0;
  const hintedEntry = {
    ensureBSMReady(callback) {
      ensureReadyCalls += 1;
      callback(true);
    },
    getStatePackage() { return 'hint_pkg'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getBehaviorManifest() { return { rosnode_name: 'hint_pkg', contains: [] }; },
  };
  const samePkgEntry = {
    ensureBSMReady() {
      throw new Error('same-package fallback should not be used when Python source hint is available');
    },
    getStatePackage() { return 'parent_pkg'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getBehaviorManifest() { return { rosnode_name: 'parent_pkg', contains: [] }; },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'hint_pkg' && name === 'ChildBehavior') {
        return hintedEntry;
      }
      if (pkg === 'parent_pkg' && name === 'ChildBehavior') {
        return samePkgEntry;
      }
      return undefined;
    },
    getByClassAndPackage(pkg, className) {
      if (pkg === 'hint_pkg' && className === 'ChildBehaviorSM') {
        return hintedEntry;
      }
      return undefined;
    },
    getBehaviorList() {
      return [
        hintedEntry,
        {
          getBehaviorName() { return 'ChildBehavior'; },
          getStatePackage() { return 'other_pkg'; },
        },
      ];
    },
  };

  const loadError = await new Promise(resolve => {
    IO.BehaviorLoader.loadBehavior({
      name: 'ParentBehavior',
      rosnode_name: 'parent_pkg',
      manifest_path: '/tmp/parent.xml',
      codefile_path: '/tmp/parent.py',
      codefile_name: 'parent_behavior_sm.py',
      codefile_content: 'root code',
      contains: [{ name: 'ChildBehavior' }],
    }, resolve);
  });

  assert.strictEqual(loadError, undefined);
  assert.strictEqual(ensureReadyCalls, 1);
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'ChildBehavior' has no package in manifest; using Python source hint package 'hint_pkg'. Please resave to make this explicit.");
}

async function runBehaviorLoaderNestedPythonHintCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  const rootManifest = {
    name: 'RootBehavior',
    rosnode_name: 'parent_pkg',
    codefile_content: 'root code',
    contains: [{ name: 'ChildBehavior' }],
  };
  const childManifest = {
    name: 'ChildBehavior',
    rosnode_name: 'child_parent_pkg',
    codefile_content: 'child code',
    contains: [{ name: 'GrandBehavior' }],
  };

  global.IO.CodeParser = {
    parseCode(code) {
      if (code === 'root code') {
        return {
          state_types: { ChildBehaviorSM: 'hint_pkg_child' },
          sm_states: [{
            sm_states: [{
              state_type: 'behavior',
              state_class: 'ChildBehaviorSM',
            }],
          }],
        };
      }
      if (code === 'child code') {
        return {
          state_types: { GrandBehaviorSM: 'hint_pkg_grand' },
          sm_states: [{
            sm_states: [{
              state_type: 'behavior',
              state_class: 'GrandBehaviorSM',
            }],
          }],
        };
      }
      throw new Error(`unexpected parse request for ${code}`);
    },
  };

  let childReadyCalls = 0;
  let grandReadyCalls = 0;
  const hintedGrandEntry = {
    ensureBSMReady(callback) {
      grandReadyCalls += 1;
      callback(true);
    },
    getStatePackage() { return 'hint_pkg_grand'; },
    getBehaviorName() { return 'GrandBehavior'; },
    getStateClass() { return 'GrandBehaviorSM'; },
    getBehaviorManifest() {
      return { name: 'GrandBehavior', rosnode_name: 'hint_pkg_grand', contains: [] };
    },
  };
  const samePkgGrandEntry = {
    ensureBSMReady() {
      throw new Error('same-package grandchild fallback should not be used when child Python hint is available');
    },
    getStatePackage() { return 'child_parent_pkg'; },
    getBehaviorName() { return 'GrandBehavior'; },
    getStateClass() { return 'GrandBehaviorSM'; },
    getBehaviorManifest() {
      return { name: 'GrandBehavior', rosnode_name: 'child_parent_pkg', contains: [] };
    },
  };
  const hintedChildEntry = {
    ensureBSMReady(callback) {
      childReadyCalls += 1;
      callback(true);
    },
    getStatePackage() { return 'hint_pkg_child'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getStateClass() { return 'ChildBehaviorSM'; },
    getBehaviorManifest() { return childManifest; },
  };
  const samePkgChildEntry = {
    ensureBSMReady() {
      throw new Error('same-package child fallback should not be used when root Python hint is available');
    },
    getStatePackage() { return 'parent_pkg'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getStateClass() { return 'ChildBehaviorSM'; },
    getBehaviorManifest() { return childManifest; },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'hint_pkg_child' && name === 'ChildBehavior') {
        return hintedChildEntry;
      }
      if (pkg === 'parent_pkg' && name === 'ChildBehavior') {
        return samePkgChildEntry;
      }
      if (pkg === 'hint_pkg_grand' && name === 'GrandBehavior') {
        return hintedGrandEntry;
      }
      if (pkg === 'child_parent_pkg' && name === 'GrandBehavior') {
        return samePkgGrandEntry;
      }
      return undefined;
    },
    getByClassAndPackage(pkg, className) {
      if (pkg === 'hint_pkg_child' && className === 'ChildBehaviorSM') {
        return hintedChildEntry;
      }
      if (pkg === 'hint_pkg_grand' && className === 'GrandBehaviorSM') {
        return hintedGrandEntry;
      }
      return undefined;
    },
    getByClass(className) {
      if (className === 'ChildBehaviorSM') {
        return hintedChildEntry;
      }
      if (className === 'GrandBehaviorSM') {
        return hintedGrandEntry;
      }
      return undefined;
    },
    getBehaviorList() {
      return [hintedChildEntry, hintedGrandEntry];
    },
  };

  const readyResult = await new Promise(resolve => {
    IO.BehaviorLoader.ensureSubbehaviorsReady(
      rootManifest,
      function(success, failedKey) {
        resolve({ success, failedKey });
      },
      { ChildBehavior: 'hint_pkg_child' }
    );
  });

  assert.deepStrictEqual(readyResult, { success: true, failedKey: undefined });
  assert.strictEqual(childReadyCalls, 1);
  assert.strictEqual(grandReadyCalls, 1);
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'ChildBehavior' has no package in manifest; using Python source hint package 'hint_pkg_child'. Please resave to make this explicit.");
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'GrandBehavior' has no package in manifest; using Python source hint package 'hint_pkg_grand'. Please resave to make this explicit.");
}

async function runBehaviorLoaderDuplicateNameHintsCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  const rootManifest = {
    name: 'RootBehavior',
    rosnode_name: 'parent_pkg',
    codefile_content: 'root code',
    contains: ['Shared Behavior', 'Shared Behavior', 'Shared Behavior'],
  };

  global.IO.CodeParser = {
    parseCode(code) {
      if (code !== 'root code') {
        throw new Error(`unexpected parse request for ${code}`);
      }
      return {
        state_types: {
          SharedBehaviorSMA: 'pkg_a',
          SharedBehaviorSMB: 'pkg_b',
        },
        sm_states: [{
          sm_states: [
            { state_type: 'behavior', state_class: 'SharedBehaviorSMA' },
            { state_type: 'behavior', state_class: 'SharedBehaviorSMA' },
            { state_type: 'behavior', state_class: 'SharedBehaviorSMB' },
          ],
        }],
      };
    },
  };

  let readyCallsA = 0;
  let readyCallsB = 0;
  let updatedEntries = [];
  const entryA = {
    ensureBSMReady(callback) {
      readyCallsA += 1;
      callback(true);
    },
    getStatePackage() { return 'pkg_a'; },
    getBehaviorName() { return 'Shared Behavior'; },
    getStateClass() { return 'SharedBehaviorSMA'; },
    getBehaviorManifest() {
      return { name: 'Shared Behavior', rosnode_name: 'pkg_a', contains: [] };
    },
  };
  const entryB = {
    ensureBSMReady(callback) {
      readyCallsB += 1;
      callback(true);
    },
    getStatePackage() { return 'pkg_b'; },
    getBehaviorName() { return 'Shared Behavior'; },
    getStateClass() { return 'SharedBehaviorSMB'; },
    getBehaviorManifest() {
      return { name: 'Shared Behavior', rosnode_name: 'pkg_b', contains: [] };
    },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (name !== 'Shared Behavior') {
        return undefined;
      }
      if (pkg === 'pkg_a') {
        return entryA;
      }
      if (pkg === 'pkg_b') {
        return entryB;
      }
      return undefined;
    },
    getByClassAndPackage(pkg, className) {
      if (pkg === 'pkg_a' && className === 'SharedBehaviorSMA') {
        return entryA;
      }
      if (pkg === 'pkg_b' && className === 'SharedBehaviorSMB') {
        return entryB;
      }
      return undefined;
    },
    getBehaviorList() {
      return [entryA, entryB];
    },
    updateEntry(entry) {
      updatedEntries.push(entry);
    },
  };

  const readyResult = await new Promise(resolve => {
    IO.BehaviorLoader.ensureSubbehaviorsReady(rootManifest, function(success, failedKey) {
      resolve({ success, failedKey });
    });
  });

  assert.deepStrictEqual(readyResult, { success: true, failedKey: undefined });
  assert.strictEqual(readyCallsA, 1);
  assert.strictEqual(readyCallsB, 1);
  const ensureHintPackages = logs
    .filter(entry => entry.level === 'warn' && entry.message.includes("ensureSubbehaviorsReady: sub-behavior 'Shared Behavior' has no package in manifest; using Python source hint package '"))
    .map(entry => entry.message.match(/package '([^']+)'/)[1]);
  assert.deepStrictEqual(ensureHintPackages, ['pkg_a', 'pkg_a', 'pkg_b']);

  logs.length = 0;
  const ignoreList = IO.BehaviorLoader.loadBehaviorDependencies(rootManifest, []);

  assert.deepStrictEqual(ignoreList, ['pkg_a::Shared Behavior', 'pkg_b::Shared Behavior']);
  assert.strictEqual(updatedEntries.length, 2);
  assert.strictEqual(updatedEntries[0], entryA);
  assert.strictEqual(updatedEntries[1], entryB);
  const dependencyHintPackages = logs
    .filter(entry => entry.level === 'warn' && entry.message.includes("loadBehaviorDependencies: sub-behavior 'Shared Behavior' has no package in manifest; using Python source hint package '"))
    .map(entry => entry.message.match(/package '([^']+)'/)[1]);
  assert.deepStrictEqual(dependencyHintPackages, ['pkg_a', 'pkg_a', 'pkg_b']);
}

async function runQualifiedPackageRefsCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const loaderManifest = {
    name: 'RootBehavior',
    rosnode_name: 'parent_pkg',
    codefile_content: 'root code',
    contains: ['ChildBehavior'],
  };
  const loaderLookupCalls = [];
  const modelBehaviorLookupCalls = [];
  const stateLookupCalls = [];

  const childEntry = {
    ensureBSMReady(callback) {
      callback(true);
    },
    getStatePackage() { return 'pkg__b'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getStateClass() { return 'ChildBehaviorSM'; },
    getBehaviorManifest() {
      return { name: 'ChildBehavior', rosnode_name: 'pkg__b', contains: [] };
    },
  };
  const samePackageChildEntry = {
    ensureBSMReady() {
      throw new Error('same-package fallback should not be used when qualified class ref encodes pkg__b');
    },
    getStatePackage() { return 'parent_pkg'; },
    getBehaviorName() { return 'ChildBehavior'; },
    getStateClass() { return 'ChildBehaviorSM'; },
    getBehaviorManifest() {
      return { name: 'ChildBehavior', rosnode_name: 'parent_pkg', contains: [] };
    },
  };
  const behaviorDef = {
    getStatePackage() { return 'pkg__b'; },
    getBehaviorName() { return 'Shared Behavior'; },
    getStateClass() { return 'SharedSM'; },
    getParameters() { return []; },
    getDefaultParameterValues() { return []; },
    getOutcomes() { return ['done']; },
    getDefaultAutonomy() { return [0]; },
    getInputKeys() { return []; },
    getOutputKeys() { return []; },
  };
  const plainStateDef = {
    state_class: 'SomeState',
    outcomes: ['done'],
    autonomy: [0],
  };

  global.IO.CodeParser = {
    parseCode(code) {
      if (code !== 'root code') {
        throw new Error(`unexpected parse request for ${code}`);
      }
      return {
        state_types: {},
        sm_states: [{
          sm_states: [{
            state_type: 'behavior',
            state_class: 'pkg__b__ChildBehaviorSM',
          }],
        }],
      };
    },
  };

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'pkg__b' && name === 'ChildBehavior') {
        return childEntry;
      }
      if (pkg === 'parent_pkg' && name === 'ChildBehavior') {
        return samePackageChildEntry;
      }
      return undefined;
    },
    getByClassAndPackage(pkg, className) {
      if (className === 'ChildBehaviorSM') {
        loaderLookupCalls.push({ pkg, className });
        if (pkg === 'pkg__b') {
          return childEntry;
        }
        return undefined;
      }
      if (className === 'SharedSM') {
        modelBehaviorLookupCalls.push({ pkg, className });
        if (pkg === 'pkg__b') {
          return behaviorDef;
        }
        return undefined;
      }
      return undefined;
    },
    getBehaviorList() {
      return [childEntry, behaviorDef];
    },
  };

  loadScript('flexbe_webui/app/io/io_behaviorloader.js');

  const readyResult = await new Promise(resolve => {
    IO.BehaviorLoader.ensureSubbehaviorsReady(loaderManifest, function(success, failedKey) {
      resolve({ success, failedKey });
    });
  });

  assert.deepStrictEqual(readyResult, { success: true, failedKey: undefined });
  assert.deepStrictEqual(loaderLookupCalls, [{ pkg: 'pkg__b', className: 'ChildBehaviorSM' }]);
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'ChildBehavior' has no package in manifest; using Python source hint package 'pkg__b'. Please resave to make this explicit.");

  function defineBaseStateApi(target, stateName, stateClass, outcomes = [], autonomy = []) {
    let name = stateName;
    let position = { x: 0, y: 0 };
    let parameterValues = [];
    let autonomyValues = autonomy.slice();
    let inputMapping = [];
    let outputMapping = [];
    let container;

    target.getStateName = function() { return name; };
    target.setStateName = function(newName) { name = newName; };
    target.getStateClass = function() { return stateClass; };
    target.getStateType = function() { return stateClass; };
    target.getStatePath = function() {
      return container ? `${container.getStatePath()}/${name}` : `/${name}`;
    };
    target.getParameters = function() { return []; };
    target.getParameterValues = function() { return parameterValues; };
    target.setParameterValues = function(values) { parameterValues = values; };
    target.getAutonomy = function() { return autonomyValues; };
    target.setAutonomy = function(values) { autonomyValues = values; };
    target.getInputMapping = function() { return inputMapping; };
    target.setInputMapping = function(values) { inputMapping = values; };
    target.getOutputMapping = function() { return outputMapping; };
    target.setOutputMapping = function(values) { outputMapping = values; };
    target.getPosition = function() { return position; };
    target.setPosition = function(value) { position = value; };
    target.getContainer = function() { return container; };
    target.setContainer = function(value) { container = value; };
    target.getOutcomes = function() { return outcomes.slice(); };
    target.getInputKeys = function() { return []; };
    target.getOutputKeys = function() { return []; };
  }

  global.State = function(stateName, definition) {
    defineBaseStateApi(
      this,
      stateName,
      definition && definition.state_class ? definition.state_class : 'State',
      definition && definition.outcomes ? definition.outcomes : [],
      definition && definition.autonomy ? definition.autonomy : []
    );
  };
  global.BehaviorState = function(stateName, definition) {
    defineBaseStateApi(
      this,
      stateName,
      definition.getStateClass(),
      definition.getOutcomes(),
      definition.getDefaultAutonomy()
    );
  };
  global.Transition = function(from, to, outcome, autonomy) {
    this.getFrom = function() { return from; };
    this.getTo = function() { return to; };
    this.getOutcome = function() { return outcome; };
    this.getAutonomy = function() { return autonomy; };
  };
  global.Statemachine = function(stateName, definition) {
    defineBaseStateApi(this, stateName, ':STATEMACHINE', definition.getOutcomes(), []);
    const that = this;
    const states = [];
    const transitions = [];
    let initialState;
    let concurrent = false;
    let priority = false;
    let conditions = [];
    const smOutcomes = definition.getOutcomes().map(function(outcomeName) {
      const outcomeState = new State(outcomeName, { state_class: ':OUTCOME' });
      outcomeState.setContainer(that);
      return outcomeState;
    });

    this.addState = function(state) {
      states.push(state);
      state.setContainer(that);
    };
    this.getStates = function() { return states; };
    this.getStateByName = function(name) {
      return states.find(function(state) { return state.getStateName() === name; });
    };
    this.addTransition = function(transition) {
      transitions.push(transition);
    };
    this.getTransitions = function() { return transitions; };
    this.setInitialState = function(state) { initialState = state; };
    this.getInitialState = function() { return initialState; };
    this.setConcurrent = function(value) { concurrent = value; };
    this.isConcurrent = function() { return concurrent; };
    this.setPriority = function(value) { priority = value; };
    this.isPriority = function() { return priority; };
    this.setConditions = function(value) { conditions = value; };
    this.getConditions = function() { return conditions; };
    this.getSMOutcomes = function() { return smOutcomes; };
    this.getSMOutcomeByName = function(name) {
      return smOutcomes.find(function(state) { return state.getStateName() === name; });
    };
    this.tryDuplicateOutcome = function() {};
  };

  WS.StateMachineDefinition = function(outcomes, inputKeys, outputKeys) {
    this.getOutcomes = function() { return outcomes; };
    this.getInputKeys = function() { return inputKeys; };
    this.getOutputKeys = function() { return outputKeys; };
  };
  WS.Statelib = {
    getFromLib(stateKey) {
      stateLookupCalls.push(stateKey);
      if (stateKey === 'pkg__b.SomeState') {
        return plainStateDef;
      }
      return undefined;
    },
    getClassFromLib() {
      throw new Error('fallback class lookup should not be used for qualified pkg__b__SomeState');
    },
    isClassUnique() {
      return true;
    },
  };

  loadScript('flexbe_webui/app/io/io_modelgenerator.js');

  const built = IO.ModelGenerator.buildStateMachine(
    'Root',
    'root',
    [{
      sm_name: 'root',
      sm_type: 'statemachine',
      sm_params: {
        outcomes: [],
        input_keys: [],
        output_keys: [],
        conditions: [],
      },
      initial: 'Behavior State',
      oc_positions: [],
      routes: [],
    }],
    [{
      sm_name: 'root',
      sm_states: [{
        state_name: 'Behavior State',
        state_class: 'pkg__b__SharedSM',
        state_type: 'behavior',
        parameter_values: [],
        autonomy: [0],
        remapping: [],
        state_pos_x: 10,
        state_pos_y: 20,
        transitions_from: [],
      }, {
        state_name: 'Plain State',
        state_class: 'pkg__b__SomeState',
        state_type: 'state',
        parameter_values: [],
        autonomy: [0],
        remapping: [],
        state_pos_x: 30,
        state_pos_y: 40,
        transitions_from: [],
      }],
    }],
    true
  );

  assert.strictEqual(built.getStates().length, 2);
  assert.deepStrictEqual(modelBehaviorLookupCalls, [{ pkg: 'pkg__b', className: 'SharedSM' }]);
  assert(stateLookupCalls.includes('pkg__b.SomeState'));
  assert(
    !logs.some(entry => entry.level === 'error' && entry.message.includes('Unable to find')),
    `unexpected qualified ref resolution error: ${JSON.stringify(logs, null, 2)}`
  );
}

async function runOutcomeCopyRenameWithCopiesCase() {
  // Regression: updateOutcome must rename all #N copies in sm_outcomes and keep
  // transitions pointing at the renamed copies.
  const fixture = buildOutcomeCopyTransitionFixture();
  const { sm } = fixture;

  // Fixture state: alpha→done, beta→done#1, spare done#2
  assert.ok(sm.getSMOutcomeByName('done') != undefined, 'pre: done exists');
  assert.ok(sm.getSMOutcomeByName('done#1') != undefined, 'pre: done#1 exists');
  assert.ok(sm.getSMOutcomeByName('done#2') != undefined, 'pre: done#2 exists');

  sm.updateOutcome('done', 'complete');

  // All three sm_outcomes copies renamed
  assert.ok(sm.getSMOutcomeByName('done') == undefined, 'done removed');
  assert.ok(sm.getSMOutcomeByName('done#1') == undefined, 'done#1 removed');
  assert.ok(sm.getSMOutcomeByName('done#2') == undefined, 'done#2 removed');
  assert.ok(sm.getSMOutcomeByName('complete') != undefined, 'complete exists');
  assert.ok(sm.getSMOutcomeByName('complete#1') != undefined, 'complete#1 exists');
  assert.ok(sm.getSMOutcomeByName('complete#2') != undefined, 'complete#2 exists');

  // Outcome name in definition updated
  assert.ok(sm.getOutcomes().includes('complete'), 'getOutcomes has complete');
  assert.ok(!sm.getOutcomes().includes('done'), 'getOutcomes no longer has done');

  // Transitions point at the renamed State objects
  const transitions = sm.getTransitions().filter(function(t) {
    return t.getFrom().getStateName() !== 'INIT';
  });
  assert.strictEqual(transitions.length, 2, 'two non-init transitions');
  const alphaT = transitions.find(function(t) { return t.getFrom().getStateName() === 'Alpha'; });
  const betaT  = transitions.find(function(t) { return t.getFrom().getStateName() === 'Beta'; });
  assert.strictEqual(alphaT.getTo().getStateName(), 'complete',  'alpha→complete');
  assert.strictEqual(betaT.getTo().getStateName(),  'complete#1', 'beta→complete#1');

  // Spare copy retains correct name
  const spare = sm.getSMOutcomeByName('complete#2');
  assert.ok(spare != undefined, 'spare complete#2 exists');
  const spareHasTransition = sm.getTransitions().some(function(t) {
    return t.getTo() === spare;
  });
  assert.ok(!spareHasTransition, 'spare complete#2 has no transition');
}

async function runConcurrentOutcomeCopyCase() {
  // Concurrent containers use #N-indexed :CONDITION copies (done#0, done#1, …).
  // Unlike sequential SMs, removing a transition does NOT prune spare copies —
  // tryDuplicateOutcome only adds when ALL copies are consumed, never removes.
  const { sm: root } = setupOutcomeCopyEditorHarness();

  // Build a concurrent sub-statemachine with one outcome 'done'
  const ccDef = new WS.StateMachineDefinition(['done'], [], []);
  const cc = new Statemachine('CC', ccDef);
  cc.setConcurrent(true);
  root.addState(cc);

  // After setConcurrent, outcome is named done#0 (:CONDITION), not plain 'done'.
  // Note: getSMOutcomeByName('done') on a concurrent SM returns the first copy
  // whose name starts with 'done' — so we check the actual stateName directly.
  const copy0 = cc.getSMOutcomeByName('done#0');
  assert.ok(copy0 != undefined, 'done#0 exists after setConcurrent');
  assert.strictEqual(copy0.getStateName(), 'done#0', 'copy name is done#0, not plain done');
  assert.strictEqual(copy0.getStateClass(), ':CONDITION', 'concurrent copy is :CONDITION');
  assert.strictEqual(cc.getSMOutcomes().length, 1, 'initially one copy');

  // Add alpha→done#0; tryDuplicateOutcome creates done#1 (spare)
  const alpha = new State('Alpha', WS.Statelib.getFromLib('WorkerState'));
  cc.addState(alpha);
  cc.addTransition(new Transition(alpha, copy0, 'done', 0));
  cc.tryDuplicateOutcome('done');
  assert.strictEqual(cc.getSMOutcomes().length, 2, 'done#1 created as spare');
  const copy1 = cc.getSMOutcomeByName('done#1');
  assert.ok(copy1 != undefined, 'done#1 exists');

  // Add beta→done#1; tryDuplicateOutcome creates done#2 (spare)
  const beta = new State('Beta', WS.Statelib.getFromLib('WorkerState'));
  cc.addState(beta);
  cc.addTransition(new Transition(beta, copy1, 'done', 0));
  cc.tryDuplicateOutcome('done');
  assert.strictEqual(cc.getSMOutcomes().length, 3, 'done#2 created as spare');
  assert.ok(cc.getSMOutcomeByName('done#2') != undefined, 'done#2 exists');

  // Remove alpha's transition — done#0 freed.
  // Concurrent path does NOT prune: copy count stays at 3.
  const alphaTransition = cc.getTransitions().find(function(t) {
    return t.getFrom() === alpha;
  });
  cc.removeTransitionObject(alphaTransition);
  assert.strictEqual(cc.getSMOutcomes().length, 3, 'no pruning on removal in concurrent SM');
  assert.ok(cc.getSMOutcomeByName('done#0') != undefined, 'done#0 still present after removal');

  // tryDuplicateOutcome with a free copy available: no new copy added
  cc.tryDuplicateOutcome('done');
  assert.strictEqual(cc.getSMOutcomes().length, 3, 'no new copy when spare exists');

  // Add gamma→done#0 and delta→done#2 (consuming last two free copies);
  // tryDuplicateOutcome now creates done#3
  const gamma = new State('Gamma', WS.Statelib.getFromLib('WorkerState'));
  const delta = new State('Delta', WS.Statelib.getFromLib('WorkerState'));
  cc.addState(gamma);
  cc.addState(delta);
  cc.addTransition(new Transition(gamma, copy0, 'done', 0));
  cc.addTransition(new Transition(delta, cc.getSMOutcomeByName('done#2'), 'done', 0));
  cc.tryDuplicateOutcome('done');
  assert.strictEqual(cc.getSMOutcomes().length, 4, 'done#3 created when all consumed');
  assert.ok(cc.getSMOutcomeByName('done#3') != undefined, 'done#3 exists');
}

async function runStateGeneratedKeysCase() {
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/varsolver.js');

  // State definition with meta outcomes/input/output driven by parameters
  const stateDefWithMeta = {
    getStateClass() { return 'MetaState'; },
    getStatePath() { return 'test_pkg/MetaState'; },
    getStatePackage() { return 'test_pkg'; },
    getParameters() { return ['outcomes_param', 'input_param', 'output_param']; },
    getDefaultParameterValues() { return ["['go', 'stop']", "['key_a']", "['result']"]; },
    getOutcomes() { return ['$outcomes_param', 'fixed']; },
    getDefaultAutonomy() { return [0, 0]; },
    getInputKeys() { return ['$input_param']; },
    getOutputKeys() { return ['$output_param']; },
  };

  global.WS = { Statelib: { getFromLib() { return stateDefWithMeta; } } };
  global.UI = {
    Statemachine: {
      getDrawnState() { return undefined; },
      getPanShift() { return { x: 0, y: 0 }; },
      getR() { return { width: 400, height: 300 }; },
      getGridSize() { return 50; },
    },
  };

  loadScript('flexbe_webui/app/_model/state.js');

  const state = new State('TestState', stateDefWithMeta);

  // Constructor passes empty new_vals so no generated outcomes yet — only static ones
  assert.deepStrictEqual(state.getOutcomes(), ['fixed'], 'initial: only static outcome before setParameterValues');
  assert.deepStrictEqual(state.getInputKeys(), [], 'initial: no input keys before setParameterValues');
  assert.deepStrictEqual(state.getOutputKeys(), [], 'initial: no output keys before setParameterValues');

  // Apply default parameter values — generates dynamic outcomes/keys
  state.setParameterValues(["['go', 'stop']", "['key_a']", "['result']"]);
  assert.deepStrictEqual(state.getOutcomes(), ['fixed', 'go', 'stop'], 'after set: go and stop generated');
  assert.deepStrictEqual(state.getInputKeys(), ['key_a'], 'after set: key_a generated');
  assert.deepStrictEqual(state.getOutputKeys(), ['result'], 'after set: result generated');

  // Change parameter values — replaces dynamic outcomes, adds new input key, changes output
  state.setParameterValues(["['go', 'halt', 'error']", "['key_a', 'key_b']", "['value']"]);
  assert.deepStrictEqual(state.getOutcomes(), ['fixed', 'go', 'halt', 'error'], 'updated: stop removed, halt+error added');
  assert.deepStrictEqual(state.getInputKeys(), ['key_a', 'key_b'], 'updated: key_b added');
  assert.deepStrictEqual(state.getOutputKeys(), ['value'], 'updated: result replaced by value');

  // Clear dynamic outcomes — only static remains
  state.setParameterValues(["[]", "[]", "[]"]);
  assert.deepStrictEqual(state.getOutcomes(), ['fixed'], 'cleared: only static outcome remains');
  assert.deepStrictEqual(state.getInputKeys(), [], 'cleared: no input keys');
  assert.deepStrictEqual(state.getOutputKeys(), [], 'cleared: no output keys');

  // Restore — verify idempotent round-trip
  state.setParameterValues(["['go', 'stop']", "['key_a']", "['result']"]);
  assert.deepStrictEqual(state.getOutcomes(), ['fixed', 'go', 'stop'], 'restored outcomes');
  assert.deepStrictEqual(state.getInputKeys(), ['key_a'], 'restored input keys');
  assert.deepStrictEqual(state.getOutputKeys(), ['result'], 'restored output keys');

  // setInputKeys/setOutputKeys must keep mapping arrays in sync (regression: var shadow
  // caused the closure-level input_mapping to remain [] after setInputKeys was called,
  // which triggered the Pydantic 'input_mapping length 0 does not match input_keys length 1'
  // validation error when saving a behavior with interface input keys)
  state.setInputKeys(['alpha', 'beta']);
  assert.deepStrictEqual(state.getInputKeys(), ['alpha', 'beta'], 'setInputKeys: keys set');
  assert.deepStrictEqual(state.getInputMapping(), ['alpha', 'beta'], 'setInputKeys: mapping in sync');
  state.setOutputKeys(['result_a']);
  assert.deepStrictEqual(state.getOutputKeys(), ['result_a'], 'setOutputKeys: keys set');
  assert.deepStrictEqual(state.getOutputMapping(), ['result_a'], 'setOutputKeys: mapping in sync');
}

async function runStateUndoRedoAutonomyConsistencyCase() {
  // Regression: undo then redo of a properties-Apply that added meta-outcomes (e.g.
  // OperatorDecisionState) doubled the autonomy array.  The redo lambda was calling
  // setAutonomy BEFORE setParameterValues; updateGeneratedOutcomes then pushed onto an
  // already-populated autonomy array.  Fix: setParameterValues first in both undo and redo.
  setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  loadScript('flexbe_webui/app/_helper/varsolver.js');

  const stateDefOpDec = {
    getStateClass() { return 'OperatorDecisionState'; },
    getStatePath() { return 'flexbe_states/OperatorDecisionState'; },
    getStatePackage() { return 'flexbe_states'; },
    getParameters() { return ['outcomes']; },
    getDefaultParameterValues() { return ["[]"]; },
    getOutcomes() { return ['$outcomes']; },
    getDefaultAutonomy() { return []; },
    getInputKeys() { return []; },
    getOutputKeys() { return []; },
  };

  global.WS = { Statelib: { getFromLib() { return stateDefOpDec; } } };
  global.UI = {
    Statemachine: {
      getDrawnState() { return undefined; },
      getPanShift() { return { x: 0, y: 0 }; },
    },
  };

  loadScript('flexbe_webui/app/_model/state.js');

  const state = new State('OpDec1', stateDefOpDec);

  assert.deepStrictEqual(state.getOutcomes(), [], 'initial: no outcomes');
  assert.deepStrictEqual(state.getAutonomy(), [], 'initial: no autonomy');

  // Simulate first Apply: parameter changes from "[]" to "['enie', 'menie', 'miniy']"
  const parameters_old = ["[]"];
  const autonomy_old = [];

  state.setParameterValues(["['enie', 'menie', 'miniy']"]);
  assert.deepStrictEqual(state.getOutcomes(), ['enie', 'menie', 'miniy'], 'after first apply: 3 outcomes');
  assert.strictEqual(state.getAutonomy().length, 3, 'after first apply: autonomy has 3 entries');

  // Simulate user setting autonomy via selects (in-place, as applyPropertiesClicked does)
  state.getAutonomy()[0] = 3;
  state.getAutonomy()[1] = 2;
  state.getAutonomy()[2] = 0;
  const autonomy_new = state.getAutonomy().slice();
  const parameters_new = state.getParameterValues().slice();

  // Undo (fixed order: setParameterValues before setAutonomy)
  state.setParameterValues(parameters_old);
  state.setAutonomy(autonomy_old.slice());
  assert.deepStrictEqual(state.getOutcomes(), [], 'after undo: outcomes cleared');
  assert.deepStrictEqual(state.getAutonomy(), [], 'after undo: autonomy cleared');

  // Redo (fixed order: setParameterValues before setAutonomy)
  state.setParameterValues(parameters_new);
  state.setAutonomy(autonomy_new.slice());
  assert.deepStrictEqual(state.getOutcomes(), ['enie', 'menie', 'miniy'], 'after redo: 3 outcomes restored');
  assert.deepStrictEqual(state.getAutonomy(), [3, 2, 0], 'after redo: autonomy values correct, not doubled');
  assert.strictEqual(
    state.getAutonomy().length,
    state.getOutcomes().length,
    'after redo: autonomy and outcomes lengths match'
  );

  // Second undo/redo cycle (idempotent)
  state.setParameterValues(parameters_old);
  state.setAutonomy(autonomy_old.slice());
  state.setParameterValues(parameters_new);
  state.setAutonomy(autonomy_new.slice());
  assert.strictEqual(
    state.getAutonomy().length,
    state.getOutcomes().length,
    'second redo cycle: lengths still match'
  );
  assert.deepStrictEqual(state.getAutonomy(), [3, 2, 0], 'second redo cycle: autonomy still correct');
}

async function runSubscriberCallbackDeferredCase() {
  // Regression: setTimeout(callback(o), 0) called callback immediately (at parse time)
  // rather than deferring it.  Fix: setTimeout(function() { callback(o); }, 0).
  setupGlobals();

  let wsInstance = null;
  global.WebSocket = function(_url) {
    wsInstance = this;
    this.close = function() {};
  };
  global.window = { location: { protocol: 'http:', host: 'localhost' }, crypto: { randomUUID() { return 'test-uuid'; } } };
  global.localStorage = { getItem() { return ''; } };
  global.API = { postFlag() {} };
  global.ROS = {};

  // Deterministic parse: returns one complete message for the exact test input.
  global.json_parse_raw = function(buf) {
    const msg = '{"data":1}';
    if (buf === msg) return [{ data: 1 }, msg.length];
    return [null, 0];
  };

  const received = [];
  const deferred = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = function(fn, _delay) { deferred.push(fn); return 1; };

  try {
    loadScript('flexbe_webui/app/ros/ros_subscriber.js');
    new ROS.Subscriber('/test/topic', 'std_msgs/String', function(msg) { received.push(msg); });

    wsInstance.onmessage({ data: '{"data":1}' });

    assert.strictEqual(received.length, 0, 'callback must not fire synchronously during onmessage');
    assert.strictEqual(deferred.length, 1, 'exactly one deferred callback expected');

    deferred[0]();
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], { data: 1 });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

async function runSubscriberBufferSliceRecoveryCase() {
  // Regression: buffer.slice(err.at) discarded the result, leaving buffer unchanged
  // so parse-error recovery looped on the same bad bytes forever.
  // Fix: buffer = buffer.slice(err.at).
  setupGlobals();

  let wsInstance = null;
  global.WebSocket = function(_url) {
    wsInstance = this;
    this.close = function() {};
  };
  global.window = { location: { protocol: 'http:', host: 'localhost' }, crypto: { randomUUID() { return 'test-uuid'; } } };
  global.localStorage = { getItem() { return ''; } };
  global.API = { postFlag() {} };
  global.ROS = {};

  const GOOD = '{"ok":true}';
  let parseCalls = 0;
  global.json_parse_raw = function(buf) {
    parseCalls++;
    if (buf.startsWith('BAD')) {
      // Plain object matches how json_parse_raw actually throws — own-property 'name'
      // is required because the subscriber checks err.hasOwnProperty('name').
      throw { name: 'SyntaxError', message: 'Unexpected token', at: 3 };
    }
    if (buf === GOOD) return [{ ok: true }, GOOD.length];
    return [null, 0];
  };

  const received = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = function(fn, _delay) { fn(); return 1; };

  try {
    loadScript('flexbe_webui/app/ros/ros_subscriber.js');
    new ROS.Subscriber('/test/topic', 'std_msgs/String', function(msg) { received.push(msg); });

    // First chunk: bad bytes only — should advance buffer past them, not loop forever.
    wsInstance.onmessage({ data: 'BAD' });
    assert.strictEqual(received.length, 0, 'no message from malformed chunk');

    // Second chunk appended to the (now-empty) buffer produces valid JSON.
    wsInstance.onmessage({ data: GOOD });
    assert.strictEqual(received.length, 1, 'valid message parsed after buffer recovery');
    assert.deepStrictEqual(received[0], { ok: true });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

async function runStateMapCallbackStateIdAssignmentCase() {
  // Regression: state_map_callback had `state.getStateId() != undefined || state.getStateId() == -1`
  // The != undefined branch was always true for any defined ID, so:
  //   - states with stateId=undefined fell through to the else-if (stateMapValidationError)
  //     instead of getting their ID set.
  //   - states with a mismatching pre-existing ID were silently overwritten.
  // Fix: `== undefined || == -1` so only unset/placeholder IDs are written.
  const { consoleMessages, restoreConsole } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');

  const subscribers = {};
  global.ROS = {
    Subscriber: function(topic, _type, callback) {
      subscribers[topic] = callback;
      this.close = function() {};
    },
    Publisher: function() {
      this.publish = function() {};
      this.close = function() {};
    },
  };

  // Three states: one with stateId=undefined, one with matching ID, one with mismatching ID.
  const makeState = (id, path) => ({
    stateId: id,
    getStateId() { return this.stateId; },
    setStateId(v) { this.stateId = v; },
    getStatePath() { return path; },
  });
  const stateUnset   = makeState(undefined, '/Demo/Unset');
  const stateMatch   = makeState(0x100,     '/Demo/Match');
  const stateMismatch = makeState(0x200,    '/Demo/Mismatch');

  const stateMap = new Map([[0, { path: '', state: undefined }]]);
  let behaviorId = undefined;
  const rootSM = {
    getStatePath() { return ''; },
    getStateByPath(p) {
      if (p === '/Demo/Unset')    return stateUnset;
      if (p === '/Demo/Match')    return stateMatch;
      if (p === '/Demo/Mismatch') return stateMismatch;
      return undefined;
    },
  };

  global.Behavior.getStateMap    = () => stateMap;
  global.Behavior.getStatemachine = () => rootSM;
  global.Behavior.getBehaviorId  = () => behaviorId;
  global.Behavior.setBehaviorId  = (v) => { behaviorId = v; };
  global.Behavior.getManifestPath = () => '/tmp/demo.xml';
  global.RC.Controller = { isRunning() { return true; }, isExternal() { return false; }, isReadonly() { return false; } };
  global.UI.RuntimeControl.updateCurrentState = function() {};
  global.UI.Settings.isSynthesisEnabled = () => false;
  global.UI.Settings.getVersion = () => 'test';

  try {
    loadScript('flexbe_webui/app/rc/rc_pubsub.js');
    RC.PubSub.initialize('/');

    // Case 1: state with stateId=undefined should get its ID assigned (not a validation error).
    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 99,
      state_ids:   [0, 0x050],
      state_paths: ['', '/Demo/Unset'],
    });
    assert.strictEqual(stateUnset.stateId, 0x050, 'stateId=undefined should be assigned from state map');
    assert(
      !consoleMessages.some(m => m.includes('Unexpected state ID')),
      'no mismatch error expected for undefined stateId'
    );

    // Case 2: state with pre-existing ID matching the map — no error, ID unchanged.
    stateMap.clear();
    stateMap.set(0, { path: '', state: rootSM });
    behaviorId = undefined;
    consoleMessages.length = 0;
    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 100,
      state_ids:   [0, 0x100],
      state_paths: ['', '/Demo/Match'],
    });
    assert.strictEqual(stateMatch.stateId, 0x100, 'matching pre-existing ID should be unchanged');
    assert(
      !consoleMessages.some(m => m.includes('Unexpected state ID')),
      'no mismatch error expected for matching stateId'
    );

    // Case 3: state with mismatching pre-existing ID — validation error expected.
    stateMap.clear();
    stateMap.set(0, { path: '', state: rootSM });
    behaviorId = undefined;
    consoleMessages.length = 0;
    subscribers['/flexbe/mirror/state_map']({
      behavior_id: 101,
      state_ids:   [0, 0x999],
      state_paths: ['', '/Demo/Mismatch'],
    });
    assert(
      consoleMessages.some(m => m.includes('Unexpected state ID')),
      'mismatch error expected when pre-existing stateId differs from state map'
    );
    assert.strictEqual(stateMismatch.stateId, 0x200, 'mismatching pre-existing ID must not be overwritten');
  } finally {
    restoreConsole();
  }
}

async function main() {
  if (caseName === 'behavior_saver') {
    await runBehaviorSaverCase();
    return;
  }
  if (caseName === 'settings_flows') {
    await runSettingsCase();
    return;
  }
  if (caseName === 'menu_flows') {
    await runMenuCase();
    return;
  }
  if (caseName === 'menu_auto_layout_button') {
    await runMenuAutoLayoutButtonCase();
    return;
  }
  if (caseName === 'action_client') {
    await runActionClientCase();
    return;
  }
  if (caseName === 'render_config') {
    await runRenderConfigCase();
    return;
  }
  if (caseName === 'tuple_parameter') {
    await runTupleParameterCase();
    return;
  }
  if (caseName === 'state_parameter_doc_type_validation') {
    await runStateParameterDocTypeValidationCase();
    return;
  }
  if (caseName === 'dashboard_parameter_edit') {
    await runDashboardParameterEditCase();
    return;
  }
  if (caseName === 'dashboard_outcome_collision') {
    await runDashboardOutcomeCollisionCase();
    return;
  }
  if (caseName === 'dashboard_outcome_undo') {
    await runDashboardOutcomeUndoCase();
    return;
  }
  if (caseName === 'dashboard_interface_key_flows') {
    await runDashboardInterfaceKeyFlowsCase();
    return;
  }
  if (caseName === 'model_generator_interface_validation') {
    await runModelGeneratorInterfaceValidationCase();
    return;
  }
  if (caseName === 'behavior_interface_key_rename') {
    await runBehaviorInterfaceKeyRenameCase();
    return;
  }
  if (caseName === 'behavior_interface_outcome_rename') {
    await runBehaviorInterfaceOutcomeRenameCase();
    return;
  }
  if (caseName === 'behavior_structure_outcome_copy') {
    await runBehaviorStructureOutcomeCopyCase();
    return;
  }
  if (caseName === 'pubsub_inactive_state_map') {
    await runPubSubInactiveStateMapCase();
    return;
  }
  if (caseName === 'pubsub_outcome_request_before_state_map') {
    await runPubSubOutcomeRequestBeforeStateMapCase();
    return;
  }
  if (caseName === 'pubsub_rejects_empty_behavior_start') {
    await runPubSubRejectsEmptyBehaviorStartCase();
    return;
  }
  if (caseName === 'pubsub_clears_failed_session_restore') {
    await runPubSubClearsFailedSessionRestoreCase();
    return;
  }
  if (caseName === 'runtime_flows') {
    await runRuntimeFlowsCase();
    return;
  }
  if (caseName === 'runtime_deepest_state') {
    await runRuntimeDeepestStateCase();
    return;
  }
  if (caseName === 'runtime_pinned_level') {
    await runRuntimePinnedLevelCase();
    return;
  }
  if (caseName === 'runtime_pinned_status_cleanup') {
    await runRuntimePinnedStatusCleanupCase();
    return;
  }
  if (caseName === 'runtime_outcome_request_focus') {
    await runRuntimeOutcomeRequestFocusCase();
    return;
  }
  if (caseName === 'controller_external_prompt_preserves_terminal') {
    await runControllerExternalPromptPreservesTerminalCase();
    return;
  }
  if (caseName === 'synthesis_payload') {
    await runSynthesisPayloadCase();
    return;
  }
  if (caseName === 'synthesis_form') {
    await runSynthesisFormCase();
    return;
  }
  if (caseName === 'state_panel_flows') {
    await runStatePanelFlowsCase();
    return;
  }
  if (caseName === 'state_properties_escape_close') {
    await runStatePropertiesEscapeCloseCase();
    return;
  }
  if (caseName === 'state_panel_duplicate_guards') {
    await runStatePanelDuplicateGuardsCase();
    return;
  }
  if (caseName === 'state_panel_hover_documentation') {
    await runStatePanelHoverDocumentationCase();
    return;
  }
  if (caseName === 'behavior_source_view_nested_path') {
    await runBehaviorSourceViewNestedPathCase();
    return;
  }
  if (caseName === 'behavior_state_definition_nested_path') {
    await runBehaviorStateDefinitionNestedPathCase();
    return;
  }
  if (caseName === 'library_hover_panels_safe_text') {
    await runLibraryHoverPanelsSafeTextCase();
    return;
  }
  if (caseName === 'behavior_tag_overflow_dropdown') {
    await runBehaviorTagOverflowDropdownCase();
    return;
  }
  if (caseName === 'api_client') {
    await runApiClientCase();
    return;
  }
  if (caseName === 'helper_flows') {
    await runHelperFlowsCase();
    return;
  }
  if (caseName === 'helper_drag_cache') {
    await runHelperDragCacheCase();
    return;
  }
  if (caseName === 'drawable_state_box_layer') {
    await runDrawableStateBoxLayerCase();
    return;
  }
  if (caseName === 'statemachine_begin_transition') {
    await runStatemachineBeginTransitionCase();
    return;
  }
  if (caseName === 'statemachine_selection_cache') {
    await runStatemachineSelectionCacheCase();
    return;
  }
  if (caseName === 'statemachine_connect_throttle') {
    await runStatemachineConnectThrottleCase();
    return;
  }
  if (caseName === 'statemachine_home_end_pan') {
    await runStatemachineHomeEndPanCase();
    return;
  }
  if (caseName === 'statemachine_fit_view') {
    await runStatemachineFitViewCase();
    return;
  }
  if (caseName === 'validation_report') {
    await runValidationReportCase();
    return;
  }
  if (caseName === 'validation_style_suggestion_info') {
    await runValidationStyleSuggestionInfoCase();
    return;
  }
  if (caseName === 'terminal_safe_text') {
    await runTerminalSafeTextCase();
    return;
  }
  if (caseName === 'remaining_html_sinks_safe_text') {
    await runRemainingHtmlSinksSafeTextCase();
    return;
  }
  if (caseName === 'events_flows') {
    await runEventsFlowsCase();
    return;
  }
  if (caseName === 'command_update_behavior') {
    await runCommandUpdateBehaviorCase();
    return;
  }
  if (caseName === 'behaviorlib_update_sync_callback') {
    await runBehaviorlibUpdateSyncCallbackCase();
    return;
  }
  if (caseName === 'command_qualified_behavior') {
    await runCommandQualifiedBehaviorCase();
    return;
  }
  if (caseName === 'command_auto_layout') {
    await runCommandAutoLayoutCase();
    return;
  }
  if (caseName === 'behavior_collision_resolution') {
    await runBehaviorCollisionResolutionCase();
    return;
  }
  if (caseName === 'legacy_behavior_import_resolution') {
    await runLegacyBehaviorImportResolutionCase();
    return;
  }
  if (caseName === 'helper_class_skipped') {
    await runHelperClassSkippedCase();
    return;
  }
  if (caseName === 'outcome_copy_comment_encoding') {
    await runOutcomeCopyCommentEncodingCase();
    return;
  }
  if (caseName === 'outcome_copy_build_roundtrip') {
    await runOutcomeCopyBuildRoundTripCase();
    return;
  }
  if (caseName === 'outcome_copy_reconnect_undo') {
    await runOutcomeCopyReconnectUndoCase();
    return;
  }
  if (caseName === 'outcome_copy_remove_undo') {
    await runOutcomeCopyRemoveUndoCase();
    return;
  }
  if (caseName === 'outcome_copy_single_spare') {
    await runOutcomeCopySingleSpareCase();
    return;
  }
  if (caseName === 'outcome_copy_visible_placement') {
    await runOutcomeCopyVisiblePlacementCase();
    return;
  }
  if (caseName === 'outcome_copy_container_outcome_undo') {
    await runOutcomeCopyContainerOutcomeUndoCase();
    return;
  }
  if (caseName === 'tools_outcome_copy_paste') {
    await runToolsOutcomeCopyPasteCase();
    return;
  }
  if (caseName === 'tools_outcome_copy_paste_history') {
    await runToolsOutcomeCopyPasteHistoryCase();
    return;
  }
  if (caseName === 'tools_outcome_copy_cut_history') {
    await runToolsOutcomeCopyCutHistoryCase();
    return;
  }
  if (caseName === 'behavior_loader_failure') {
    await runBehaviorLoaderFailureCase();
    return;
  }
  if (caseName === 'behavior_loader_optional_callback') {
    await runBehaviorLoaderOptionalCallbackCase();
    return;
  }
  if (caseName === 'behavior_loader_session_record') {
    await runBehaviorLoaderSessionRecordCase();
    return;
  }
  if (caseName === 'behavior_loader_restore_failure_keeps_session') {
    await runBehaviorLoaderRestoreFailureKeepsSessionCase();
    return;
  }
  if (caseName === 'behavior_loader_browser_deferred_callbacks') {
    await runBehaviorLoaderBrowserDeferredCallbacksCase();
    return;
  }
  if (caseName === 'behavior_loader_legacy_package_default') {
    await runBehaviorLoaderLegacyPackageDefaultCase();
    return;
  }
  if (caseName === 'behavior_loader_legacy_python_hint') {
    await runBehaviorLoaderLegacyPythonHintCase();
    return;
  }
  if (caseName === 'behavior_loader_nested_python_hint') {
    await runBehaviorLoaderNestedPythonHintCase();
    return;
  }
  if (caseName === 'behavior_loader_duplicate_name_hints') {
    await runBehaviorLoaderDuplicateNameHintsCase();
    return;
  }
  if (caseName === 'qualified_package_refs') {
    await runQualifiedPackageRefsCase();
    return;
  }
  if (caseName === 'state_generated_keys') {
    await runStateGeneratedKeysCase();
    return;
  }
  if (caseName === 'state_undo_redo_autonomy_consistency') {
    await runStateUndoRedoAutonomyConsistencyCase();
    return;
  }
  if (caseName === 'outcome_copy_rename_with_copies') {
    await runOutcomeCopyRenameWithCopiesCase();
    return;
  }
  if (caseName === 'concurrent_outcome_copy') {
    await runConcurrentOutcomeCopyCase();
    return;
  }
  if (caseName === 'subscriber_callback_deferred') {
    await runSubscriberCallbackDeferredCase();
    return;
  }
  if (caseName === 'subscriber_buffer_slice_recovery') {
    await runSubscriberBufferSliceRecoveryCase();
    return;
  }
  if (caseName === 'state_map_callback_state_id_assignment') {
    await runStateMapCallbackStateIdAssignmentCase();
    return;
  }
  throw new Error(`Unknown case '${caseName}'`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
