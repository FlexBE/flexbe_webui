# Diagnostics

FlexBE WebUI exposes lightweight diagnostics endpoints to help investigate hangs, slowdowns, and websocket delivery issues.

## Endpoints

- HTML page: `/dev/diagnostics`
- Server JSON: `/api/v1/dev/diagnostics`
- ROS/websocket bridge JSON: `/api/v1/dev/diagnostics/node`

With default host/port:

- `http://127.0.0.1:8000/dev/diagnostics`
- `http://127.0.0.1:8000/api/v1/dev/diagnostics`
- `http://127.0.0.1:8000/api/v1/dev/diagnostics/node`

## What You Get

`/api/v1/dev/diagnostics` includes:

- recent viewer/editor timing entries
- parse timing entries (`io/behaviors`, `io/states`)
- full behavior load timing entries (`behavior_full`)
- auto-layout timing entries (`auto_layout`)
- per-category summary stats (count/avg/max)
- success/failure counters

`/api/v1/dev/diagnostics/node` includes:

- active publisher/subscriber/action client counts
- websocket send success/failure counters
- active websocket topics
- recent websocket send failures (topic + timestamp + error)

## Notes

- These diagnostics are intended for development/troubleshooting.
- Data is in-memory and resets when the process restarts.
- The diagnostics page auto-refreshes every 2 seconds.

## Access restriction

All diagnostics endpoints are restricted to loopback clients (`127.0.0.1` / `::1`).
Requests from any other address receive HTTP 403, regardless of how the server is bound.

If you need diagnostics from a remote machine, use SSH port-forwarding:

```bash
ssh -L 8000:127.0.0.1:8000 <robot-host>
# then open http://127.0.0.1:8000/dev/diagnostics locally
```

