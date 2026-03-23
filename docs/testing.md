# Testing

This page summarizes the test entry points that are useful during development and review.

## Standard Test Run

From the workspace root, use the package's normal ROS test flow:

```bash
colcon test --packages-select flexbe_webui
colcon test-result --verbose
```

If you are already in the package root, the main Python test suites can also be run directly:

```bash
pytest -q
```

## Frontend Regression Harness

The browser-free frontend regression harness covers key UI logic without launching a browser.
It requires `node` to be available on `PATH`; otherwise the corresponding pytest modules are skipped.

Run the full suite from the repository root:

```bash
pytest -q test/test_frontend_regressions.py
```

Run an individual harness case directly with Node.js:

```bash
node test/frontend_regression_runner.js settings_flows
node test/frontend_regression_runner.js runtime_flows
node test/frontend_regression_runner.js events_flows
```

## RC Controller / PubSub Regression Harness

This dedicated harness focuses on runtime controller and pub/sub ordering behavior.
It also requires `node` on `PATH`; if `node` is unavailable, the pytest wrapper skips these cases.

Run the full suite:

```bash
pytest -q test/test_frontend_rc_regressions.py
```

Run a single case directly:

```bash
node test/frontend_rc_regression_runner.js heartbeat_ordering
node test/frontend_rc_regression_runner.js ready_ordering
```

## Optional Browser Smoke Test

The browser smoke test is optional and intended for local developer use.
It is skipped unless `RUN_BROWSER_SMOKE=1` is set.

Run it from the repository root with:

```bash
RUN_BROWSER_SMOKE=1 pytest -q test/test_browser_smoke.py
```

Prerequisites:

1. Install the Python package:
   `pip install playwright`
2. Install a browser for Playwright:
   `python3 -m playwright install chromium`

## High-Value Direct Test Targets

These targeted suites are useful when you are working in one area of the codebase:

```bash
pytest -q test/test_api_security.py
pytest -q test/test_api_contract.py
pytest -q test/test_command_endpoint_shapes.py
pytest -q test/test_behavior_code_generation.py
pytest -q test/test_smoke_server.py
```

## Notes

- `colcon test` is still the primary package-level validation path.
- The frontend Node harnesses are intended to catch UI regressions that are hard to cover with backend tests alone.
- The optional browser smoke test is for local confidence, not normal CI/build-farm execution.
