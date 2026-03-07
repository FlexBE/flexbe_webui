# FlexBE WebUI

FlexBE WebUI provides a user interface to [FlexBE](https://github.com/flexbe_behavior_engine), the Flexible Behavior Engine.

The tool provides a graphical editor for designing Hierarchical Finite State Machines (HFSMs) for execution by the onboard Flexible Behavior Engine. During runtime, the UI enables the operator to supervise the execution of the onboard behavior, provide input where necessary, and
take control if needed in what we term "collaborative autonomy".

This UI uses native Python and FastAPI along with a JavaScript-based browser interface
to interact with the Flexible Behavior Engine.

For detailed information on FlexBE, see the [documentation](https://flexbe.readthedocs.io/en/latest/).

This version supersedes the 4.0.0 version of the [flexbe_app](https://github.com/flexbe/flexbe_app) interface.
The `flexbe_webui` has the look of the classic `flexbe_app` with some notable improvements:
  * Ability to select and adjust the endpoints and labels of transitions.
  * Improved handling of concurrent states and embedded states requiring operator feedback.
  * Improved handling of exiting with unsaved changes, or exiting while a behavior is running.
  * Option to save behaviors to your development `src` folder in your workspace (in addition to the `install` folder).
  * Native Python publishing and subscribing for easier UI development and debugging.
  * Exported JSON-based configuration text file.
  * Improved tab handling.
  * Improved panning of the canvas for larger state machines using `Shift` + arrow keys, plus `Home` and `End`.

> Note: This version `4.0+` of `flexbe_webui` is designed to work with version `4.0+` of the `flexbe_behavior_engine`.
> If using an earlier `3.x.x` version of `flexbe_behavior_engine`, use either the `flexbe_app` or the "beta-enhanced" branch of `flexbe_webui`. The FlexBE WebUI is not compatible with `flexbe_behavior_engine` version `2.x.x`.

## Quick Start

1. Install dependencies and build your workspace.
2. Run OCS:
   - `ros2 launch flexbe_webui flexbe_ocs.launch.py`
3. (Optional) Run headless and connect client separately:
   - terminal 1: `ros2 launch flexbe_webui flexbe_ocs.launch.py headless:=true`
   - terminal 2: `ros2 run flexbe_webui webui_client`

## Documentation

- [docs/index.md](docs/index.md)

### Setup
- [docs/installation.md](docs/installation.md)

### Operation
- [docs/running.md](docs/running.md)
- [docs/shortcuts.md](docs/shortcuts.md)
- [docs/runtime-architecture.md](docs/runtime-architecture.md)
- [docs/testing.md](docs/testing.md)
- [docs/security.md](docs/security.md)
- [docs/diagnostics.md](docs/diagnostics.md)
- [docs/package-discovery.md](docs/package-discovery.md)

### Troubleshooting
- [docs/troubleshooting.md](docs/troubleshooting.md)

## Publications

Please use the following publications as references when using FlexBE and the FlexBE WebUI:

- Philipp Schillinger, Stefan Kohlbrecher, and Oskar von Stryk, ["Human-Robot Collaborative High-Level Control with Application to Rescue Robotics"](http://dx.doi.org/10.1109/ICRA.2016.7487442), IEEE International Conference on Robotics and Automation (ICRA), Stockholm, Sweden, May 2016.

- Joshua Zutell, David C. Conner, and Philipp Schillinger, ["ROS 2-Based Flexible Behavior Engine for Flexible Navigation,"](http://dx.doi.org/10.1109/SoutheastCon48659.2022.9764047), IEEE SouthEastCon, April 2022.

- Samuel Raymond, Grace Walters, Joshua Luzier, and David C. Conner, ["Design and Development of the FlexBE WebUI with Introductory Tutorials"](https://dl.acm.org/doi/10.5555/3722479.3722523), Journal of Computing Sciences in Colleges, Volume 40, Issue 3, October 2024.

----
