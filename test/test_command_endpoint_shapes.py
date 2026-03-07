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

"""Tests for explicit command endpoint payload shapes."""

import argparse
import asyncio
import json

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import OpenFileEditorRequest
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


@pytest.fixture
def server_with_package(tmp_path, monkeypatch):
    """Create a server with one editable package rooted in tmp_path/pkg."""
    monkeypatch.delenv('FLEXBE_WEBUI_API_TOKEN', raising=False)

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    (package_root / 'inside.py').write_text('print("inside")\n', encoding='utf-8')
    manifest_dir = tmp_path / 'lib' / 'test_pkg' / 'manifest'
    manifest_dir.mkdir(parents=True)

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


def test_save_config_settings_returns_data_ok_on_success(server_with_package):
    """Saving configuration should return explicit command success."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={'configuration': server_with_package._settings.copy()},
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True


def test_save_config_settings_returns_data_ok_on_failure(server_with_package):
    """Saving configuration failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={},
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_open_file_editor_returns_data_ok_on_success(server_with_package, monkeypatch):
    """Editor open success should return explicit command success."""
    server_with_package._settings['editor_command'] = 'gedit $FILE'
    server_with_package._settings['allow_editors'] = ['gedit']
    monkeypatch.setattr('flexbe_webui.webui_server.shutil.which', lambda _cmd: '/usr/bin/gedit')

    popen_calls = []

    class _DummyProcess:
        pass

    def _fake_popen(*args, **kwargs):
        popen_calls.append({'args': args, 'kwargs': kwargs})
        return _DummyProcess()

    monkeypatch.setattr('flexbe_webui.webui_server.Popen', _fake_popen)

    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/open_file_editor'),
        json_file_dict=OpenFileEditorRequest(package='test_pkg', file='inside.py', line='1'),
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True
    assert len(popen_calls) == 1
    expected_file = f"{server_with_package.packages['test_pkg'].python_path}/inside.py"
    assert popen_calls[0]['args'][0] == ['gedit', expected_file]
    assert popen_calls[0]['kwargs']['start_new_session'] is True


def test_open_file_editor_returns_data_ok_on_failure(server_with_package):
    """Editor open failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/open_file_editor'),
        json_file_dict=OpenFileEditorRequest(package='test_pkg', file='../outside.py', line='1'),
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_manifest_generator_returns_data_ok_on_success(server_with_package):
    """Manifest generation success should return explicit command success."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict={
            'ws': '    ',
            'behavior_names': [],
            'behavior': {
                'behavior_name': 'Demo Behavior',
                'behavior_package': 'test_pkg',
                'behavior_description': 'desc',
                'tags': '',
                'author': 'tester',
                'creation_date': '2026-03-06',
                'private_variables': [],
                'default_userdata': [],
                'private_functions': [],
                'behavior_parameters': [],
                'interface_outcomes': [],
                'interface_input_keys': [],
                'interface_output_keys': [],
                'comment_notes': [],
                'root_sm': {
                    'state_name': 'root',
                    'state_class': ':STATEMACHINE',
                    'state_import': '',
                    'state_pkg': 'test_pkg',
                    'state_path': '',
                    'parameters': [],
                    'parameter_values': [],
                    'outcomes': [],
                    'autonomy': [],
                    'meta_outcomes': [],
                    'outcomes_unc': [],
                    'outcomes_con': [],
                    'input_keys': [],
                    'output_keys': [],
                    'meta_input': [],
                    'meta_output': [],
                    'input_mapping': [],
                    'output_mapping': [],
                    'position_x': 0,
                    'position_y': 0,
                    'behavior_state': False,
                    'state_machine': True,
                    'states': [],
                    'transitions': [],
                    'dataflow': [],
                    'sm_outcomes': [],
                },
                'readonly': False,
                'manual_code_import': [],
                'manual_code_init': '',
                'manual_code_create': '',
                'manual_code_func': '',
            },
        },
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True


def test_manifest_generator_returns_data_ok_on_failure(server_with_package):
    """Manifest generation failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict={'behavior': {}, 'behavior_names': [], 'ws': '    '},
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False
