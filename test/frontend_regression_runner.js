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
  let strictElementLookup = false;

  global.window = global;
  global.Mousetrap = {
    bind() {},
  };
  global.localStorage = {
    setItem() {},
    getItem() { return null; },
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
  removeButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
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
      goals: 'br_c',
      initial_condition: 'bd_a',
      initial_conditions: 'bd_a',
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
        { name: 'goals', kind: 'string', type: 'string' },
        { name: 'initial_conditions', kind: 'string', type: 'string' },
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

  document.getElementById('input_prop_synthesis_request__goals').value = 'br_c';
  document.getElementById('input_prop_synthesis_request__initial_conditions').value = 'bd_a';
  document.getElementById('input_prop_synthesis_request__specification_file_name').value = 'spec.yaml';
  document.getElementById('input_prop_synthesis_synthesis_options').value = 'fast';

  const payload = UI.Panels.StateProperties.DEBUG_buildSynthesisPayload(schema, state);
  assert.deepStrictEqual(payload, {
    request: {
      spec_name: '/Container',
      system_name: 'coffee_maker',
      goals: 'br_c',
      initial_conditions: 'bd_a',
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
  assert(tooltipText.includes('    - fast'));
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

async function runManifestParserNestedPathsCase() {
  setupGlobals();

  global.DOMParser = function() {
    this.parseFromString = function() {
      const behavior = {
        getAttribute(name) {
          return name === 'name' ? 'Nested Demo Behavior' : undefined;
        },
      };
      const executable = {
        getAttribute(name) {
          if (name === 'package_path') {
            return 'test_pkg.nested.deeper.demo_nested_behavior_sm';
          }
          if (name === 'class') {
            return 'NestedDemoBehaviorSM';
          }
          return undefined;
        },
      };
      const description = { childNodes: [{ nodeValue: 'Nested demo behavior' }] };
      const tagstring = { childNodes: [{ nodeValue: 'tag' }] };
      const author = { childNodes: [{ nodeValue: 'tester' }] };
      const date = { childNodes: [{ nodeValue: '2026-03-31' }] };
      const containsA = {
        getAttribute(name) {
          if (name === 'name') return 'ChildBehavior';
          if (name === 'package') return 'child_pkg';
          return undefined;
        },
      };
      const containsB = {
        getAttribute(name) {
          if (name === 'name') return 'LocalBehavior';
          return undefined;
        },
      };

      return {
        getElementsByTagName(name) {
          switch (name) {
            case 'behavior': return [behavior];
            case 'executable': return [executable];
            case 'description': return [description];
            case 'tagstring': return [tagstring];
            case 'author': return [author];
            case 'date': return [date];
            case 'params': return [];
            case 'contains': return [containsA, containsB];
            default: return [];
          }
        },
      };
    };
  };

  loadScript('flexbe_webui/app/io/io_manifestparser.js');

  const manifest = IO.ManifestParser.parseManifest('<behavior />', '/tmp/nested_demo.xml', '/workspace/test_pkg');

  assert.deepStrictEqual(manifest, {
    name: 'Nested Demo Behavior',
    description: 'Nested demo behavior\n',
    tags: 'tag',
    author: 'tester',
    date: '2026-03-31',
    rosnode_name: 'test_pkg',
    codefile_name: 'demo_nested_behavior_sm',
    codefile_path: '/workspace/test_pkg/nested/deeper',
    codefile_relpath: 'nested/deeper/demo_nested_behavior_sm',
    class_name: 'NestedDemoBehaviorSM',
    params: [],
    contains: [
      { name: 'ChildBehavior', package: 'child_pkg' },
      'LocalBehavior',
    ],
    file_path: '/tmp/nested_demo.xml',
  });
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
}

async function runApiClientCase() {
  setupGlobals();

  let abortCalled = false;
  global.AbortController = function() {
    this.signal = {};
    this.abort = function() {
      abortCalled = true;
    };
  };

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = function(callback) {
    return { callback };
  };
  global.clearTimeout = function() {};

  try {
    loadScript('flexbe_webui/app/api.js');

    global.fetch = function() {
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

    const circular = {};
    circular.self = circular;
    const stringifyFailure = await new Promise(resolve => {
      API.post('broken_post', circular, resolve);
    });
    assert.strictEqual(stringifyFailure.success, false);
    assert(stringifyFailure.error.includes('circular'));

    global.fetch = function() {
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

    const dataSuccess = await new Promise((resolve, reject) => {
      API.postData('data_ok', { value: 1 },
        data => resolve(data),
        error => reject(new Error(error)));
    });
    assert.deepStrictEqual(dataSuccess, { ok: true, value: 42 });
    assert.strictEqual(abortCalled, false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
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

async function runValidationReportCase() {
  const { logs } = setupGlobals();
  loadScript('flexbe_webui/app/prototype.js');
  global.T.show = function() {};

  let saveCalls = 0;
  global.IO.BehaviorSaver = {
    saveStateMachine() {
      saveCalls += 1;
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
  assertLog(logs, 'warn', 'Saving with 1 non-fatal validation warning');

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
      warnings: ['warning a', 'warning b'],
      info: [],
    };
  };

  UI.Menu.checkBehaviorClicked();
  assertLog(logs, 'warn', 'Behavior is valid with 2 non-fatal warning');
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

  UI.Panels.StateProperties.displayStateProperties(fixture.nested);
  const removeButton = document.getElementById('panel_prop_sm_outcomes_content_0_remove');
  removeButton.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(fixture.activities.length, 1);
  assert.deepStrictEqual(fixture.nested.getOutcomes(), []);
  assert.strictEqual(fixture.nested.getTransitions().length, 1);
  assert.strictEqual(fixture.root.getTransitions().length, 1);
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

  fixture.activities[0].redo();

  assert.deepStrictEqual(fixture.nested.getOutcomes(), []);
  assert.strictEqual(fixture.nested.getTransitions().length, 1);
  assert.strictEqual(fixture.root.getTransitions().length, 1);
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
  if (caseName === 'runtime_flows') {
    await runRuntimeFlowsCase();
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
  if (caseName === 'manifest_parser_nested_paths') {
    await runManifestParserNestedPathsCase();
    return;
  }
  if (caseName === 'library_hover_panels_safe_text') {
    await runLibraryHoverPanelsSafeTextCase();
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
  if (caseName === 'validation_report') {
    await runValidationReportCase();
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
  if (caseName === 'command_qualified_behavior') {
    await runCommandQualifiedBehaviorCase();
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
  if (caseName === 'state_generated_keys') {
    await runStateGeneratedKeysCase();
    return;
  }
  throw new Error(`Unknown case '${caseName}'`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
