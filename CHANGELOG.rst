^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Changelog for package flexbe_webui
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

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
