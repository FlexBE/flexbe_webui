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
      this.children.push(child);
      this.options.push(child);
      return child;
    },
    removeChild() {},
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
        elements.set(id, makeElement(id));
      }
      return elements.get(id);
    },
    createElement() {
      const element = makeElement();
      const baseSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        baseSetAttribute.call(this, name, value);
        if (name === 'id') {
          elements.set(value, this);
        }
      };
      return element;
    },
    createTextNode(text) {
      return { textContent: text };
    },
    getElementsByTagName() {
      return [makeElement('body')];
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
  setupGlobals();
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
  assert.strictEqual(parsingResult.sm_states[0].sm_states[0].state_class, 'SharedSM');
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

  global.WS.Behaviorlib = {
    getByKey(pkg, name) {
      if (pkg === 'hint_pkg' && name === 'ChildBehavior') {
        return hintedEntry;
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
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: sub-behavior 'ChildBehavior' has no package in manifest; defaulting lookup to same package 'parent_pkg'.");
  assertLog(logs, 'warn', "ensureSubbehaviorsReady: resolved legacy sub-behavior 'ChildBehavior' via Python source hint to package 'hint_pkg'.");
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
  if (caseName === 'api_client') {
    await runApiClientCase();
    return;
  }
  if (caseName === 'helper_flows') {
    await runHelperFlowsCase();
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
  if (caseName === 'behavior_loader_failure') {
    await runBehaviorLoaderFailureCase();
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
  throw new Error(`Unknown case '${caseName}'`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
