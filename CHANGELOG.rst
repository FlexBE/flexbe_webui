^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Changelog for package flexbe_webui
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

4.1.3 (2026-05-11)
------------------
* Fix to work with flexbe_behaviors packages defined using ament_python
* Align flake8 with ROS 2 defaults
* Update for CI testing
* Suppress A005 and B008 in flake8 config (intentional patterns)
* Bind loop variable in closure
* Remove redundant exception subtypes
* Rename unused loop variables
* Fix lightweight CI: correct smoke path, config, and triggers

4.1.2 (2026-05-08)
------------------
* Add Fit View (``Ctrl+0``) to zoom the canvas to fit the full state machine
  * click anywhere to recenter and exit fit view
  * ``Ctrl+0`` or ``Esc`` to toggle and return back to prior view
  * ``Shift + arrow`` pan shortcut to exit.
* Restore the last-loaded behavior across WebUI client reconnects
  * The server persists session state and the client reloads it automatically on first heartbeat after reconnect.
* Track runtime display depth and let users pin a display level that survives sibling-state
  transitions, with a short fallback window before committing to a shallower view.
* Add simple automatic layout for behavior-selection state machines (``Tools → Auto Layout``).
* Add package-aware selective behavior loading so multi-package workspaces load only the packages
  they need; resolves cross-package name collisions unambiguously.
* Improve behavior loading and rendering performance for large behavior libraries and state machines.
* Add copied-outcome connection support so copied states carry their outgoing transitions.
* Document all new shortcuts in ``docs/shortcuts.md``.
* Add ``Home`` / ``End`` canvas pan shortcuts, including ``Ctrl``/``Shift`` variants and ``Shift+Space`` home.
* Make UI panel sizes configurable through the Settings panel.
* Rescale state positions proportionally when the statemachine font size is changed.
* ``Ctrl+S`` now applies pending state property edits before saving to prevent parameter loss.
* Fix behavior save paths for install-space and symlink (editable-install) package layouts.
* Fix transition label stacking for outcomes that share the same target state.
* Fix WebSocket subscriber lifecycle: defer subscription destruction to the ROS executor thread to prevent ``InvalidHandle`` crashes on disconnect.
* Accept boolean and ``None`` values in tuple-type parameters; add parameter type tooltips.
* Send synthesis predicates as arrays to match the expected action payload shape.
* Downgrade suggested state-name style warnings to local info so they do not pollute the user-facing console.
* Harden behavior parser, API/ROS transport handling, action-goal cancellation, safe text rendering, interface resolution, and nested behavior path handling.
* Fix Pydantic v1/v2 serialization compatibility in the package cache and behavior endpoints.

4.1.1 (2026-03-25)
------------------
* Fix UI freeze when autonomy raised while behavior is blocked
* Update PriorityContainer processing
* Add external behavior detection, blocked launch feedback, and attach flow improvements
* Validate action type format and restrict config save path to prevent traversal
* Fix code generator and behavior IO crashes on malformed or incomplete inputs
* Fix backend robustness: websocket loop race, settings validation, exception handling
* Guard frontend message field accesses against malformed runtime messages
* Fix Pydantic v1 API usage, add State model list length validation, guard synthesis container
* Fix Array.prototype.remove, add API response warning, fix lint

4.1.0 (2026-03-07)
------------------
* Add ``--host`` argument to bind server to specific network interface (default: 127.0.0.1)
* Default WebSocket URL to ``window.location.host`` so client works on non-localhost connections
* Add ``--disable_gpu`` option to work around blank screen on systems with older NVIDIA GPUs
* clarify that webui_client depends on local venv install of PySide6, and is not listed as a package dependency
* update dependencies and documentation
* Harden server startup, settings, and packaged configuration (`304046d`)

  * Hardened server startup, diagnostics, and packaged configuration handling.
  * Added packaged default config loading through the install/share path, following symlinks to the canonical file.
  * Added typed settings normalization and validation, including `server_timeout`.
  * Fixed launch/client host propagation and cache-preserving startup defaults.
  * Improved web client startup options, including `disable_gpu`.
  * Added lightweight CI workflow coverage.

* Document operation, testing, diagnostics, and shortcuts (`b00f18d`)

  * Expanded and reorganized project documentation.
  * Added dedicated docs for installation, running, diagnostics, security, testing, troubleshooting, package discovery, runtime architecture, and keyboard shortcuts.
  * Updated `README.md` and `CONTRIBUTING.md` to point to the new docs and developer workflows.

* Harden API, ROS transport, and behavior IO flows (`039f4b8`)

  * Standardized API request/response handling across frontend and backend.
  * Added typed request models for API endpoints and tightened request validation.
  * Normalized frontend API handling so malformed or failed responses are treated as explicit failures.
  * Hardened ROS transport wrappers for publishers, subscribers, and action clients.
  * Fixed behavior save/load and manifest parsing edge cases.
  * Improved bootstrap/offline recovery behavior in the window shell.
  * Implement "Save As" functionality on behavior name change

* Polish editor panels, rendering, validation, and interaction flows (`0179a89`)

  * Refined editor panel behavior across dashboard, state machine, configuration, feed, terminal, menu, and shared tools.
  * Added separate dashboard and statemachine text sizing.
  * Added bold and extra-bold statemachine text and adjustable transition line weights.
  * Kept render preferences separate from saved state machine coordinates.
  * Fixed numerous state panel, dashboard, container, and menu interaction bugs.
  * Improved autocomplete, validation, focus handling, and terminal/feed behavior.
  * Cleaned up drawable/rendering logic and related CSS styling.
  * Hardened helper/model logic used across the UI.

* Stabilize runtime messaging and add schema-driven synthesis support (`b084a0f`)

  * Stabilized runtime messaging, state display, and synthesis integration.
  * Fixed runtime controller/pubsub ordering and stale-path handling.
  * Added action-goal schema introspection on the backend.
  * Replaced hard-coded synthesis form fields with a schema-driven generated form in the UI.
  * Made synthesis goal population respond to actual message fields rather than fixed action-type branches.
  * Preserved compatibility by skipping payload fields not present in the installed ROS message type.

* Add regression, contract, and smoke test coverage (`e077eec`)

  * Added broad automated regression coverage across backend and frontend flows.
  * Added browser-free frontend regression harnesses for API handling, runtime flows, dashboard editing, state panel flows, helper logic, validation behavior, and synthesis payload/form behavior.
  * Added dedicated RC frontend regression harness.
  * Added API contract, security, command-shape, and behavior code-generation tests.
  * Added action-goal cancellation tests.
  * Added startup smoke tests and optional browser smoke coverage.


4.0.3 (2025-03-26)
------------------
* update to enable qt software rendering
* update README with links, known issue comment, and description

4.0.2 (2025-03-17)
------------------
* basic states do not use Inherit autonomy level
* Put outcomes to right side of canvas by default
* reset transitions on reconnect to handle pan shifting properly
* add new states to upper left of view when canvas is shifted
* update pan-shift handling with SHIFT-left/right/up/down/home/end
* remove out of date IE fireEvent handling
* calculate extents of state machine canvas
* add handling for :OUTCOME states in the StateInstantiation message (used by future synthesis)
* deprecate conversion handling and pkg init
* fix typo in action result message
* modify to allow setting LICENSE of saved behaviors to BSD-3, Apache-2, or Custom

4.0.1 (2024-09-26)
------------------
* codespell clean up
* correct element name
* add missing comma in setup.py
* fix two bugs related to inconsistent naming
* update fastapi version to avoid security warning
* allow autonomy level selection on container outcomes
* move selection functionality
* copy/paste updates
* misc fixes
* do not scroll behavior feeback if user has moved scroll bar
  * but warn more text is available with pale yellow background
  * auto scroll if scroll at bottom
* use backgroundColor consistently

4.0.0 (2024-08-25)
------------------
* this version is only compatible with version 4+ of the FlexBE Behavior engine
* this version is jumping the initial version directly to 4.0.0 to match the onboard and API designation
* this implements version 4.1.0 of UI api
  * this uses state id for onboard/ocs synchronization and messaging instead of full path strings
  * this is only an internal change between onboard and OCS

0.0.1 (2024-08-25)
------------------
* released as beta-enhanced using the flexbe_app 4.0.0 API
* use 2.5% for spinner values on numeric parameters
* add additional data validation and handling for dashboard entries
* RC view transition handling;
* add more robust data validation and handling to dashboard
* add html and style for popup modal dialogs
* update mousetrap version and add mousetrap-global-bind
* add call to single initialize_flexbe_core (settings allow for old way)
* handle onEnterButton and onEnterInput differently; modify manual import handling; add newline on code blocks
* update to force redraw on sync and outcome request; clean up
* clean up code generation to match style guidelines
* clean up spam
* massive change adding tab handling (prevent issue #4)
* additional code formatting
* remove newlines in UI parser
* additional variable checks (#3)
* add additional ccs styles to support updated html
* add name checking and tweak outputs
* add flags to control debug spam
* add removeHover to state properties tooltip popup
* confirm deletion of individual state
* allow editing of manual blocks in UI; update code generation with ui changes; add imports to variable checking;
* handle more lambda expressions and support triple quote delimiter for strings
* add handling for boolean operators in lambda; clean up some messages; detail code issues if save behavior fails
* modify parsing of lambda functions
* increase client delay when launching full system
* simplify test for valid equation
* update handling of synthesized state machine data
* update OCS status logic; fix launch message; clean up
* add command line option to filter webserver (uvicorn) logging (default: warning)

0.0.0 (2024-06-13)
------------------
* original release as beta
