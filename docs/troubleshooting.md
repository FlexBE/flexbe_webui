# Troubleshooting

## UI Restart Does Not Restore Prior Editing State

- Stop behaviors before closing the UI.
- Load behavior again after restarting the UI.

## Transition Placement Compatibility

Edits made in `flexbe_webui` are not preserved if behavior is resaved with legacy `flexbe_app`.

## Qt Spell-Check Dictionary Warning

Startup warnings about path override/dictionary may appear and are typically benign.

Optional env var:

```bash
export QTWEBENGINE_DICTIONARIES_PATH=~/.dict
```

See Qt docs:

- https://doc.qt.io/qt-6/qtwebengine-features.html

## Blank Client Window on Some Ubuntu 24.04 + Older NVIDIA GPUs

Try one of:

- `ros2 run flexbe_webui webui_client --disable_gpu` (preferred)
- `ros2 run flexbe_webui webui_client --qt_software`
- use browser-based UI

## Source/Install Mismatch During Development

After code updates, rebuild + source before launch:

```bash
colcon build --packages-select flexbe_webui --symlink-install
source install/setup.bash
```

## Diagnostics

For timing/websocket diagnostics, see:

- [docs/diagnostics.md](diagnostics.md)

## Security

For token auth and network exposure guidance, see:

- [docs/security.md](security.md)
