# Copyright 2026 Christopher Newport University
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Small in-process smoke test for WebUI server startup and readiness route."""

import argparse
import asyncio
import importlib.util
import json
import os
import sys
import types

from fastapi.routing import APIRoute

from starlette.responses import Response


def _install_shims_if_needed():
    """Provide minimal stubs for ROS-only imports when running outside ROS."""
    if 'ament_index_python' not in sys.modules and importlib.util.find_spec('ament_index_python') is None:
        ament_index_python = types.ModuleType('ament_index_python')
        ament_index_python.get_package_share_directory = lambda _: os.getcwd()
        ament_index_python.get_packages_with_prefixes = lambda: {}
        sys.modules['ament_index_python'] = ament_index_python

        ament_index_python_packages = types.ModuleType('ament_index_python.packages')
        ament_index_python_packages.get_package_share_directory = lambda _: os.getcwd()
        sys.modules['ament_index_python.packages'] = ament_index_python_packages

    if 'flexbe_core' not in sys.modules and importlib.util.find_spec('flexbe_core') is None:
        flexbe_core = types.ModuleType('flexbe_core')

        class EventState:
            """Minimal placeholder for parser imports."""

        flexbe_core.EventState = EventState
        sys.modules['flexbe_core'] = flexbe_core


def _find_endpoint(app, path, method):
    """Find FastAPI endpoint function by path and method."""
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path == path and method in route.methods:
            return route.endpoint
    raise RuntimeError(f'No endpoint found for {method} {path}')


def _decode_response(result):
    """Decode endpoint result regardless of response wrapper."""
    if isinstance(result, Response):
        return json.loads(result.body.decode('utf-8'))
    return result


def test_ready_endpoint_smoke():
    """Verify the in-process server exposes the readiness endpoint."""
    _install_shims_if_needed()

    from flexbe_webui.webui_server import WebuiServer

    args = argparse.Namespace(
        config_folder='config',
        config_file='flexbe_webui_config.json',
        clear_cache=True,
    )
    server = WebuiServer(args, online_mode=True)
    endpoint = _find_endpoint(server._app, '/api/v1/ready', 'GET')
    result = _decode_response(asyncio.run(endpoint()))

    assert isinstance(result, dict)
    assert result.get('success') is True
    assert result.get('data', {}).get('status') == 'ok'
    assert result.get('data', {}).get('online_mode') is True
    print('Smoke test passed: /api/v1/ready is reachable and returns expected payload.')


def test_ready_endpoint_smoke_offline():
    """Verify the readiness endpoint reports offline mode when requested."""
    _install_shims_if_needed()

    from flexbe_webui.webui_server import WebuiServer

    args = argparse.Namespace(
        config_folder='config',
        config_file='flexbe_webui_config.json',
        clear_cache=True,
    )
    server = WebuiServer(args, online_mode=False)
    endpoint = _find_endpoint(server._app, '/api/v1/ready', 'GET')
    result = _decode_response(asyncio.run(endpoint()))

    assert isinstance(result, dict)
    assert result.get('success') is True
    assert result.get('data', {}).get('status') == 'ok'
    assert result.get('data', {}).get('online_mode') is False


def main():
    """Allow manual execution outside pytest."""
    test_ready_endpoint_smoke()


if __name__ == '__main__':
    main()
