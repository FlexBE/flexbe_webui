# Installation

Clone the following repos into your ROS workspace (e.g. `$WORKSPACE_ROOT/src` or `ros2_ws/src`):

- `git clone https://github.com/FlexBE/flexbe_behavior_engine.git`  (if not already present via binary install)
- `git clone https://github.com/FlexBE/flexbe_webui.git`

Make sure branches match your ROS/FlexBE version (e.g. `ros2-devel`, `iron`, `jazzy`).

Install dependencies:

- `rosdep update`
- `rosdep install --from-paths src --ignore-src`

`flexbe_webui` Python requirements are listed in `setup.py` and `requires.txt`.

## Ubuntu 24.04 (ROS 2 Jazzy)

These apt packages are sufficient for most dependencies:

- `python3-websockets`
- `python3-pydantic`
- `python3-fastapi`

`PySide6` is typically not available via apt on Ubuntu 24.04, so a venv path is recommended.

### Recommended venv setup

From workspace root:

```bash
virtualenv -p python3 --system-site-packages ./venv
source ./venv/bin/activate
touch ./venv/COLCON_IGNORE
cd src/
```

Then build from workspace root (`colcon build`).

If needed, install explicitly:

```bash
venv/bin/pip3 install -r $WORKSPACE_ROOT/src/flexbe_webui/requires.txt
```

This should place `PySide6` under:

`$WORKSPACE_ROOT/venv/lib/python3.12/site-packages`

You can run without activating the venv if this path is on `PYTHONPATH`:

```bash
export PYTHONPATH=$PYTHONPATH:$WORKSPACE_ROOT/venv/lib/python3.12/site-packages
```

