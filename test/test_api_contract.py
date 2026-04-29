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

"""API envelope contract tests for HTTP endpoints."""

import argparse
import asyncio
import json

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import AutoLayoutRequest, BehaviorCodeGeneratorRequest, FileRequest, LayoutNode, LayoutTransition, OpenFileEditorRequest
from flexbe_webui.ros import PackageData
from flexbe_webui.webui_server import WebuiServer

import pytest

from starlette.requests import Request
from starlette.responses import Response


def _find_endpoint(app, path, method):
    """Return endpoint function for path and HTTP method."""
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path == path and method in route.methods:
            return route.endpoint
    raise AssertionError(f'No endpoint for {method} {path}')


def _build_request(path, method='POST', headers=None):
    """Construct a minimal Starlette request object."""
    header_items = []
    for key, value in (headers or {}).items():
        header_items.append((key.lower().encode('utf-8'), value.encode('utf-8')))

    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': method,
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode('utf-8'),
        'query_string': b'',
        'headers': header_items,
        'client': ('testclient', 12345),
        'server': ('localhost', 8000),
    }
    return Request(scope)


def _decode_response(result):
    """Return decoded JSON payload from either a Response or plain object."""
    if isinstance(result, Response):
        return json.loads(result.body.decode('utf-8'))
    return result


def _assert_envelope(result):
    """Validate the normalized API response envelope."""
    assert isinstance(result, dict)
    assert {'success', 'data', 'error', 'status'}.issubset(result.keys())
    assert isinstance(result['success'], bool)
    assert isinstance(result['status'], int)


@pytest.fixture
def server_with_package(tmp_path, monkeypatch):
    """Create a server with one editable package rooted in tmp_path/pkg."""
    monkeypatch.delenv('FLEXBE_WEBUI_API_TOKEN', raising=False)

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    (package_root / 'inside.py').write_text('print("inside")\n', encoding='utf-8')

    args = argparse.Namespace(
        config_folder=str(tmp_path),
        config_file='',
        clear_cache=True,
    )
    server = WebuiServer(args)
    server._packages = {
        'test_pkg': PackageData(
            name='test_pkg',
            path=str(tmp_path),
            python_path=str(package_root),
            editable=True,
        )
    }
    return server


def test_api_http_routes_return_normalized_envelopes(server_with_package, monkeypatch):
    """All HTTP API routes should return the normalized response envelope."""
    monkeypatch.setattr('flexbe_webui.webui_server.parse_behavior_folder', lambda *args, **kwargs: [])
    monkeypatch.setattr('flexbe_webui.webui_server.parse_state_folder', lambda *args, **kwargs: [])
    monkeypatch.setattr('flexbe_webui.webui_server.has_behaviors', lambda *_args, **_kwargs: False)
    monkeypatch.setattr('flexbe_webui.webui_server.has_states', lambda *_args, **_kwargs: False)
    monkeypatch.setattr('flexbe_webui.webui_server.shutil.which', lambda _cmd: '/usr/bin/editor')
    monkeypatch.setattr('flexbe_webui.webui_server.Popen', lambda *args, **kwargs: object())

    cases = [
        ('GET', '/api/v1/dev/diagnostics',
         lambda endpoint: asyncio.run(endpoint())),
        ('GET', '/api/v1/ready',
         lambda endpoint: asyncio.run(endpoint())),
        ('POST', '/api/v1/confirm_shutdown',
         lambda endpoint: asyncio.run(endpoint(request=_build_request('/api/v1/confirm_shutdown'), allow_shutdown=False))),
        ('GET', '/api/v1/get_config_files',
         lambda endpoint: asyncio.run(endpoint())),
        ('POST', '/api/v1/get_config_settings',
         lambda endpoint: asyncio.run(endpoint(json_file_dict=None))),
        ('POST', '/api/v1/save_config_settings',
         lambda endpoint: asyncio.run(endpoint(
             request=_build_request('/api/v1/save_config_settings'),
             json_dict={'configuration': server_with_package._settings.copy()},
         ))),
        ('GET', '/api/v1/packages/behaviors',
         lambda endpoint: asyncio.run(endpoint())),
        ('GET', '/api/v1/io/behaviors/{package_name}',
         lambda endpoint: asyncio.run(endpoint(package_name='test_pkg'))),
        ('GET', '/api/v1/packages/states',
         lambda endpoint: asyncio.run(endpoint())),
        ('GET', '/api/v1/io/states/{package_name}',
         lambda endpoint: asyncio.run(endpoint(package_name='test_pkg'))),
        ('POST', '/api/v1/open_file_editor',
         lambda endpoint: asyncio.run(endpoint(
             request=_build_request('/api/v1/open_file_editor'),
             json_file_dict=OpenFileEditorRequest(package='test_pkg', file='inside.py', line='1'),
         ))),
        ('POST', '/api/v1/view_file_source',
         lambda endpoint: asyncio.run(endpoint(
             json_file_dict=FileRequest(package='test_pkg', file='inside.py'),
         ))),
        ('POST', '/api/v1/statemachine/auto_layout',
         lambda endpoint: asyncio.run(endpoint(
             json_layout_dict=AutoLayoutRequest(
                 container_name='root',
                 initial_state_name='Alpha',
                 states=[
                     LayoutNode(state_name='Alpha', state_class='AlphaState', position_x=0, position_y=0),
                     LayoutNode(state_name='Beta', state_class='BetaState', position_x=0, position_y=120),
                 ],
                 outcomes=[
                     LayoutNode(state_name='finished', state_class=':OUTCOME', position_x=200, position_y=0),
                 ],
                 transitions=[
                     LayoutTransition(from_state_name='Alpha', to_state_name='Beta', outcome='done'),
                     LayoutTransition(from_state_name='Beta', to_state_name='finished', outcome='done'),
                 ],
             ),
         ))),
        ('POST', '/api/v1/behavior/code_generator',
         lambda endpoint: asyncio.run(endpoint(
             request=_build_request('/api/v1/behavior/code_generator'),
             json_dict=BehaviorCodeGeneratorRequest(
                 ws='    ',
                 package_name='test_pkg',
                 file_name='inside',
                 save_as=True,
                 explicit_package=False,
                 behavior_names=[],
                 behavior={},
             ),
         ))),
        ('POST', '/api/v1/behavior/manifest_generator',
         lambda endpoint: asyncio.run(endpoint(
             request=_build_request('/api/v1/behavior/manifest_generator'),
             json_manifest_dict={'behavior': {}, 'behavior_names': [], 'ws': '    '},
         ))),
    ]

    for method, path, invoke in cases:
        endpoint = _find_endpoint(server_with_package._app, path, method)
        result = _decode_response(invoke(endpoint))
        _assert_envelope(result)


def test_library_endpoints_return_items_and_errors(server_with_package, monkeypatch):
    """State and behavior library endpoints should expose parsed items and non-fatal errors."""
    monkeypatch.setattr(
        'flexbe_webui.webui_server.parse_state_folder',
        lambda *_args, **_kwargs: [{'state_class': 'DemoState'}],
    )
    monkeypatch.setattr(
        'flexbe_webui.webui_server.parse_behavior_folder',
        lambda *_args, **kwargs: kwargs['errors'].append('manifest warning') or [{'name': 'DemoBehavior'}],
    )

    states_endpoint = _find_endpoint(server_with_package._app, '/api/v1/io/states/{package_name}', 'GET')
    states_result = _decode_response(asyncio.run(states_endpoint(package_name='test_pkg')))

    assert states_result['success'] is True
    assert states_result['data']['items'] == [{'state_class': 'DemoState'}]
    assert states_result['data']['errors'] == []

    behaviors_endpoint = _find_endpoint(server_with_package._app, '/api/v1/io/behaviors/{package_name}', 'GET')
    behaviors_result = _decode_response(asyncio.run(behaviors_endpoint(package_name='test_pkg')))

    assert behaviors_result['success'] is True
    assert behaviors_result['data']['items'] == [{'name': 'DemoBehavior'}]
    assert behaviors_result['data']['errors'] == ['manifest warning']
