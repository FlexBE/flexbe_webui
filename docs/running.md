# Running

## Quick Modes

- Full OCS (recommended): `ros2 launch flexbe_webui flexbe_ocs.launch.py`
- Headless server (for separate client): `ros2 launch flexbe_webui flexbe_ocs.launch.py headless:=true`
- Standalone client: `ros2 run flexbe_webui webui_client`
- Browser UI: `python3 -m webbrowser -n http://127.0.0.1:8000`

## Port/Host

Default bind:

- host: `127.0.0.1`
- port: `8000`

You can override via launch args or node CLI args.

If running across machines, set host/IP accordingly and ensure firewall/routing rules are correct.

## Common Launch Profiles

- Normal local OCS:
  - `ros2 launch flexbe_webui flexbe_ocs.launch.py`
- Headless + separate client:
  - terminal 1: `ros2 launch flexbe_webui flexbe_ocs.launch.py headless:=true`
  - terminal 2: `ros2 run flexbe_webui webui_client`
- Full onboard + OCS on one desktop:
  - `ros2 launch flexbe_webui flexbe_full.launch.py`

## Running OCS Nodes Individually

- Mirror:
  - `ros2 run flexbe_mirror behavior_mirror_sm --ros-args --remap __node:="behavior_mirror" -p use_sim_time:=False`
- Launcher:
  - `ros2 run flexbe_widget be_launcher --ros-args --remap name:="behavior_launcher" -p use_sim_time:=False`
- WebUI node:
  - `ros2 run flexbe_webui webui_node`

## Token Auth Usage

If token auth is enabled on server (`FLEXBE_WEBUI_API_TOKEN`), clients must send:

- `Authorization: Bearer <token>` or
- `X-API-Token: <token>`

`webui_client` forwards these automatically if `FLEXBE_WEBUI_API_TOKEN` is set in the client environment.

## Diagnostics URLs

- HTML page: `http://127.0.0.1:8000/dev/diagnostics`
- Server JSON: `http://127.0.0.1:8000/api/v1/dev/diagnostics`
- Node bridge JSON: `http://127.0.0.1:8000/api/v1/dev/diagnostics/node`

