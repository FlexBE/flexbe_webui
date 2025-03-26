# FlexBE WebUI

FlexBE WebUI provides a user interface to [FlexBE](https://github.com/flexbe_behavior_engine) - The Flexible Behavior Engine.

The tool provides a graphical editor for design Hierarchical Finite State Machines (HFSM) for execution by the onboard Flexible Behavior Engine.  During runtime, the UI enables the operator to supervise the execution of the onboard behavior, provide input where necessary, and
take control if needed in what we term "collaborative autonomy".

This UI uses native Python and FastAPI along with a JavaScript-based web browser interface
to interface with the Flexible Behavior Engine.

For detailed information on FlexBE see the [documentation](https://flexbe.readthedocs.io/en/latest/).

This version supersedes the 4.0.0 version of the [flexbe_app](https://github.com/flexbe/flexbe_app) interface.
The `flexbe_webui` has the look of the classic `flexbe_app` with some notable improvements:
  * Ability to select and adjust the endpoints and labels of transitions.
  * Improved handling of concurrent states and embedded states requiring operator feedback.
  * Improved handling of exiting and losing unsaved changes, or exiting with running behavior.
  * Option to save behaviors to your development `src` folder in your workspace (in addition to `install` folder)
  * Native Python publishing and subscribing for easier development debugging of the UI
  * Exported `json` based configuration text file
  * Improved tab handling
  * Improved panning of canvas for larger statemachines using SHIFT-left/right/up/down/home/end keys

> Note: This version `4.0+` of `flexbe_webui` is designed to work with version `4.0+` of the `flexbe_behavior_engine`.
> If using an earlier `3.x.x` version of `flexbe_behavior_engine`, use either the `flexbe_app` or the "beta-enhanced" branch of `flexbe_webui`.  The FlexBE WebUI is not compatible with `flexbe_behavior_engine` version `2.x.x`.

## Installation

Clone the following repos into your ROS workspace (e.g. `$WORKSPACE_ROOT/src` or `ros2_ws/src`):

  * `git clone https://github.com/FlexBE/flexbe_behavior_engine.git`  # if not already present via binary install
  * `git clone https://github.com/FlexBE/flexbe_webui.git`

Make sure that the branches are appropriate for your version (e.g. `git checkout ros2-devel`, `iron`, or `jazzy` as appropriate)

Install any required dependencies.

 * `rosdep update`
 * `rosdep install --from-paths src --ignore-src`

The `flexbe_webui` requires consistent versions of several Python dependencies; these are specified in the `install_requires` field of the `setup.py` and
the `requires.txt` file.

The system has currently been tested on Ubuntu 24.04 with the following Python packages `pip install`ed locally via the `requires.txt`:
   * `pip install fastAPI>=0.109.1`
   * `pip install pydantic>=1.10.13`
   * `pip install PySide6>=6.7.1`
   * `pip install websockets>=10.3`

On Ubuntu 24.04 (i.e., for ROS 2 Jazzy), the system installs for `sudo apt install python3-websockets python3-pydantic python3-fastapi`
are sufficient and can be installed via `rosdep` from the `package.xml` dependencies.

Unfortunately, `PySide6` is not in the current Ubuntu 24.04 binaries.
In 24.04 you are required to set up a virtual environment and cannot do a local install.

The following has been tested under 24.04.  First go to your `WORKSPACE_ROOT` (e.g. `ros2_ws`) and run the following commands.
```
virtualenv -p python3 --system-site-packages ./venv
source ./venv/bin/activate
touch ./venv/COLCON_IGNORE
cd src/
```

This creates a `venv` folder that we will `COLCON_IGNORE` during builds.

> NOTE: In this set up, we are choosing to use all the standard system dependencies (e.g. `numpy` as required by ROS message handling.)
> This approach is *NOT* strictly segregating your Python environment - "Caveat Emptor" for this new development.

Now `colcon build` from this environment.

If the Python files are not installed automatically, you can directly go to the `$WORKSPACE_ROOT` folder and :
* `venv/bin/pip3 install -r $WORKSPACE_ROOT/src/flexbe_webui/requires.txt`

This will install all of the required files in the virtual environment.

This should install the required `PySide6` in this activated virtual environment under `$WORKSPACE_ROOT/venv/lib/python3.12/site-packages`.

To run, just add this `site-packages` path to your `PYTHONPATH` using:
  * `export PYTHONPATH=$PYTHONPATH:$WORKSPACE_ROOT/venv/lib/python3.12/site-packages`
You do *NOT* need to activate the virtual environment to run this in the future, just be sure this `venv` path is added to your `PYTHONPATH` in terminals that need it.

----

## Running the FlexBE Web-based User Interface.

To execute the runtime Operator Control Station (OCS) on one machine, you may choose one of either:
  * `ros2 launch flexbe_webui flexbe_ocs.launch.py`
  This runs all of the OCS including the PySide6-based UI client.

To assist in debugging development, or to run the UI on separate machine, we can start the `webui_client` separately
  * `ros2 launch flexbe_webui flexbe_ocs.launch.py headless:=true`
    > `headless:=true` starts the main server node without the UI

  Then one (and only one) of
  * `ros2 run flexbe_webui webui_client`

  This starts the PySide6 UI in a single window and is the recommended mode.

  * `python3 -m webbrowser -n http://127.0.0.1:8000`

    > Note:
    - The `-n` option opens web browser in a new window
    - Use `-t` instead to open in new tab in existing browser window.

  * Use `http://127.0.0.1:8000` in your browser window


  The port number `8000` can be changed and specified in the node invocation; see `webui_node.py`
  If running one separate machines, then the IP address must be changed accordingly.
  Use the `--help` to see command line options for changing the IP and port.

  > Note: This version of the `flexbe_webui` is inherently *insecure*!
    * Secure your robot control network from outside influence as the ports are known by default and no special security is in place.

  > We recommend running `ros2 launch flexbe_webui flexbe_ocs.launch.py headless:=true` and `ros2 run flexbe_webui webui_client` in a
  > separate terminal for initial testing.

To run the full OCS nodes individually use
 * `ros2 run flexbe_mirror behavior_mirror_sm --ros-args --remap __node:="behavior_mirror" -p use_sim_time:=False`
    * This runs on OCS computer, listens to `'flexbe/mirror/outcome'` topic to follow the state-to-state transitions.
      This allows the OCS to "mirror" what is happening onboard the robot

 * `ros2 run flexbe_widget be_launcher --ros-args --remap name:="behavior_launcher" -p use_sim_time:=False`
    * This node listens to the UI and sends behavior structures and start requests to onboard
    * This can also be used separately from UI to launch behavior either on start up or by sending requests

 * `ros2 run flexbe_webui webui_node`
   * Operates the web server that coordinates communication with UI

 * Run the UI, you may choose one of either:
    * `ros2 run flexbe_webui webui_client` (Recommended)
    * `python3 -m webbrowser -n http://127.0.0.1:8000`
        * Browser-based user interface
    * Use `http://127.0.0.1:8000` in your browser window

To run the full FlexBE system, including the onboard behavior engine and the OCS, on one desktop in one terminal
 * `ros2 launch flexbe_webui flexbe_full.launch.py`


## FlexBE State and Behavior Discovery

The system explores the ROS workspace searching for specific tags in the `package.xml` files.

### State packages

A package is a state package for FlexBE if its `package.xml` declares the export of `flexbe_states`:

    <package>
    ...
      <export>
        <flexbe_states />
      </export>
    ...
    </package>

It is then expected to provide Python class definitions as described in [Developing Basic States](http://wiki.ros.org/flexbe/Tutorials/Developing%20Basic%20States).

Example: [flexbe_states](https://github.com/FlexBE/flexbe_behavior_engine/tree/ros2-devel/flexbe_states)

### Behavior packages

A behavior package contains the code and manifest files generated by the FlexBE user interface.

Usually, you do not need to modify it manually. Again, a behavior package is identified by an export statement in its `package.xml`:

    <package>
    ...
      <export>
        <flexbe_behaviors />
      </export>
    ...
    </package>

A behavior package is expected to provide a `manifest` folder which contains the manifests for all provided behaviors. The behaviors are located in a Python module named like the package and contained in the `src` folder.

## Publications

Please use the following publications for reference when using FlexBE and the FlexBE WebUI

- Philipp Schillinger, Stefan Kohlbrecher, and Oskar von Stryk, ["Human-Robot Collaborative High-Level Control with Application to Rescue Robotics"](http://dx.doi.org/10.1109/ICRA.2016.7487442), IEEE International Conference on Robotics and Automation (ICRA), Stockholm, Sweden, May 2016.

- Joshua Zutell, David C. Conner, and Philipp Schillinger, ["ROS 2-Based Flexible Behavior Engine for Flexible Navigation ,"](http://dx.doi.org/10.1109/SoutheastCon48659.2022.9764047), IEEE SouthEastCon, April 2022.

- Samuel Raymond, Grace Walters, Joshua Luzier, and David C. Conner, ["Design and Development of the FlexBE WebUI with Introductory Tutorials"](https://dl.acm.org/doi/10.5555/3722479.3722523), Journal of Computing Sciences in Colleges, Volume 40, Issue 3, October 2024.

----

## Known issues

 * Restarting the UI does *NOT* load in current state

    * Stop behaviors before closing the UI
    * Load a new behavior when restarting UI

  * The `flexbe_app` will not save any custom transition adjustments made under `flexbe_webui`.
    *  Placement will be lost if you resave under `flexbe_app`.

  * Starting the `flexbe_webui` client will display warning about Path override failed.
    * This is related to a browser spell checking dictionary issue and can be ignored.
    * Set environment variable `export QTWEBENGINE_DICTIONARIES_PATH=~/.dict` if dictionary is in that folder.
      * See the [Qt documentation](https://doc.qt.io/qt-6/qtwebengine-features.html) for more information.

  * This version of the `flexbe_webui` is inherently *insecure*.
    * Secure your network from outside influence as the ports are known by default and no special security is in place.

  * On some Ubuntu 24.04 systems with older NVidia GPUs, there is an issue that causes the FlexBE WebUI
    client to display a blank screen when running with GazeboSim or Turtlesim.
    * Use the `--qt_software` flag to force software rendering; e.g., `ros2 run flexbe_webui webui_client --qt_software`
    * or you may access with web browser as described above.
